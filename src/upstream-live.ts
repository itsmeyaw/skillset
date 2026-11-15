import { Effect, Layer, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { detectAgents, getSupportedAgents, installSkills, resolveSource } from "skills";
import { PIN_PATTERN } from "./pin.ts";
import { parseSource } from "./source.ts";
import { ambiguousTreeMessage, Upstream, UpstreamError } from "./upstream.ts";

// git-remote-ext(1): ext:: executes an arbitrary helper command.
const executableTransport = (source: string) => /^ext::/iu.test(source);

// git-ls-remote(1): peeled tags use ^{}; prefer them to tag objects and branches.
export const selectRemoteCommit = (output: string, ref?: string): string | undefined => {
  const refs = new Map<string, string>();
  for (const line of output.split("\n")) {
    const [sha, name] = line.split("\t");
    if (name !== undefined && sha !== undefined && PIN_PATTERN.test(sha)) {
      refs.set(name, sha);
    }
  }
  return ref === undefined
    ? refs.get("HEAD")
    : (refs.get(`refs/tags/${ref}^{}`) ??
        refs.get(`refs/tags/${ref}`) ??
        refs.get(`refs/heads/${ref}`));
};

// skills@1.8.1 parseSource: GitHub shorthand resolves to a GitHub clone URL.
const gitRemote = (source: string): string => {
  if (/^[\w.-]+\/[\w.-]+$/u.test(source))
    return `https://github.com/${source}${source.endsWith(".git") ? "" : ".git"}`;
  return source;
};

export const UpstreamLive = Layer.effect(
  Upstream,
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const toError = (error: unknown) =>
      new UpstreamError({ message: error instanceof Error ? error.message : String(error) });
    // skills API: installSkills cannot accept ref with a resolved source; scope owns disposal.
    const resolvePinned = (source: string, commit: string) =>
      Effect.acquireRelease(
        // skills@1.8.1 parseSource: shorthand already ending in .git otherwise gains a second .git.
        Effect.tryPromise({
          try: async () => {
            if (executableTransport(source)) throw new Error("Unsupported Git transport: ext");
            const input = source.replace(/^([\w.-]+\/[\w.-]+)\.git(?=#|@|$)/u, "$1");
            try {
              return await resolveSource(input, { ref: commit });
            } catch (error) {
              // gitremote-helpers(7): force the HTTP helper without changing the repository URL.
              if (
                !(error instanceof Error) ||
                error.name !== "SKILLS_INVALID_OPTION_VALUE" ||
                error.message !== "ref must be used only with git sources" ||
                !/^https?:\/\//iu.test(input)
              )
                throw error;
              // Spec #1, User Story 12: never reinterpret rejected Sources as Git repositories.
              const parsed = parseSource(input);
              if ("error" in parsed) throw new Error(parsed.error);
              const url = new URL(input);
              url.hash = "";
              return resolveSource(`${url.protocol.slice(0, -1)}::${url.href}`, { ref: commit });
            }
          },
          catch: toError,
        }),
        (handle) => Effect.promise(() => handle.dispose()),
      ).pipe(
        Effect.filterOrFail(
          (handle) => handle.source.commit === commit,
          () => new UpstreamError({ message: `Source did not resolve to Pin ${commit}` }),
        ),
      );
    return Upstream.of({
      resolveCommit: Effect.fn("Upstream.resolveCommit")(function* (source, ref, treeRefs = []) {
        if (executableTransport(source)) {
          return yield* new UpstreamError({ message: "Unsupported Git transport: ext" });
        }
        // Spec #1, Upstream service: full commit Pins require no remote lookup.
        if (ref !== undefined && PIN_PATTERN.test(ref) && treeRefs.length === 0) return ref;
        const patterns =
          ref === undefined
            ? ["HEAD"]
            : [ref, ...treeRefs].flatMap((name) => [
                `refs/tags/${name}^{}`,
                `refs/tags/${name}`,
                `refs/heads/${name}`,
              ]);
        const result = yield* Effect.scoped(
          Effect.gen(function* () {
            const child = yield* spawner.spawn(
              ChildProcess.make("git", ["ls-remote", "--", gitRemote(source), ...patterns], {
                env: { GIT_TERMINAL_PROMPT: "0" },
                extendEnv: true,
                stdin: "ignore",
              }),
            );
            // effect/process ChildProcessSpawner: drain both pipes while awaiting the exit code.
            return yield* Effect.all(
              [
                child.stdout.pipe(Stream.decodeText(), Stream.mkString),
                child.stderr.pipe(Stream.decodeText(), Stream.mkString),
                child.exitCode,
              ],
              { concurrency: "unbounded" },
            );
          }),
        ).pipe(
          Effect.mapError(
            (error) => new UpstreamError({ message: `git failed: ${error.message}` }),
          ),
        );
        const [stdout, stderr, code] = result;
        if (code !== 0) {
          return yield* new UpstreamError({ message: `git ls-remote failed: ${stderr.trim()}` });
        }
        // git-ls-remote(1): a longer matching ref makes a tree URL ambiguous.
        if (treeRefs.some((candidate) => selectRemoteCommit(stdout, candidate) !== undefined)) {
          return yield* new UpstreamError({ message: ambiguousTreeMessage });
        }
        const commit =
          ref !== undefined && PIN_PATTERN.test(ref) ? ref : selectRemoteCommit(stdout, ref);
        if (commit === undefined) {
          return yield* new UpstreamError({
            message: `Ref ${ref ?? "HEAD"} not found in ${source}`,
          });
        }
        return commit;
      }),
      resolveSource: resolvePinned,
      listSkills: (source, commit) =>
        Effect.scoped(
          resolvePinned(source, commit).pipe(
            // Issue #11: preserve descriptions for interactive selection.
            Effect.map((handle) =>
              handle.skills.map(({ name, description }) => ({ name, description })),
            ),
          ),
        ),
      install: (source, options) =>
        Effect.tryPromise({ try: () => installSkills(source, options), catch: toError }),
      detectAgents: (options) =>
        Effect.tryPromise({ try: () => detectAgents(options), catch: toError }),
      getSupportedAgents: Effect.sync(() => getSupportedAgents()),
    });
  }),
);
