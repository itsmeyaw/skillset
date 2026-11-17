import { Effect, Layer, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { detectAgents, getSupportedAgents, installSkills, resolveSource } from "skills";
import { PIN_PATTERN } from "./pin.ts";
import { Upstream, UpstreamError } from "./upstream.ts";

// Spec #1, User Story 12: never reinterpret rejected Sources as Git repositories.
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

export const UpstreamLive = Layer.effect(
  Upstream,
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const toError = (error: unknown) =>
      new UpstreamError({ message: error instanceof Error ? error.message : String(error) });
    // skills API: installSkills cannot accept ref with a resolved source; scope owns disposal.
    const resolvePinned = (source: string, commit: string) =>
      Effect.acquireRelease(
        Effect.tryPromise({
          try: async () => {
            if (executableTransport(source)) throw new Error("Unsupported Git transport: ext");
            try {
              return await resolveSource(source, { ref: commit });
            } catch (error) {
              // gitremote-helpers(7): force the HTTP helper without changing the repository URL.
              if (
                !(error instanceof Error) ||
                error.name !== "SKILLS_INVALID_OPTION_VALUE" ||
                error.message !== "ref must be used only with git sources" ||
                !/^https?:\/\//iu.test(source)
              )
                throw error;
              const url = new URL(source);
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
      resolveRefs: Effect.fn("Upstream.resolveRefs")(function* (source, refs) {
        if (executableTransport(source))
          return yield* new UpstreamError({ message: "Unsupported Git transport: ext" });
        const patterns = refs.flatMap((name) =>
          name === undefined
            ? ["HEAD"]
            : [`refs/tags/${name}^{}`, `refs/tags/${name}`, `refs/heads/${name}`],
        );
        const result = yield* Effect.scoped(
          Effect.gen(function* () {
            const child = yield* spawner.spawn(
              ChildProcess.make("git", ["ls-remote", "--", source, ...patterns], {
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
        return refs.map((ref) => selectRemoteCommit(stdout, ref));
      }),
      resolveSource: resolvePinned,
      install: (source, options) =>
        Effect.tryPromise({ try: () => installSkills(source, options), catch: toError }),
      detectAgents: (options) =>
        Effect.tryPromise({ try: () => detectAgents(options), catch: toError }),
      getSupportedAgents: Effect.sync(() => getSupportedAgents()),
    });
  }),
);
