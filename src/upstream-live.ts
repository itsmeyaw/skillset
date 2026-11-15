import { Effect, Layer, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { detectAgents, getSupportedAgents, installSkills, resolveSource } from "skills";
import { Upstream, UpstreamError } from "./upstream.ts";

// git-ls-remote(1): peeled tags use ^{}; prefer them to tag objects and branches.
export const selectRemoteCommit = (output: string, ref?: string): string | undefined => {
  const refs = new Map<string, string>();
  for (const line of output.split("\n")) {
    const [sha, name] = line.split("\t");
    if (name !== undefined && sha !== undefined && /^[a-f0-9]{40}$/u.test(sha)) {
      refs.set(name, sha);
    }
  }
  return ref === undefined
    ? refs.get("HEAD")
    : (refs.get(`refs/tags/${ref}^{}`) ??
        refs.get(`refs/tags/${ref}`) ??
        refs.get(`refs/heads/${ref}`));
};

// Spec #1, Source parsing: GitHub shorthand and tree URLs identify a repository.
const gitRemote = (source: string): string => {
  const withoutRef = source.split("#")[0] ?? source;
  const shorthand = /^([\w.-]+\/[\w.-]+)(?:@[^/]+)?$/u.exec(withoutRef);
  if (shorthand?.[1] !== undefined)
    return `https://github.com/${shorthand[1].replace(/\.git$/u, "")}.git`;
  const tree = /^(https?:\/\/github\.com\/[^/]+\/[^/]+)\/tree\//u.exec(withoutRef);
  return tree?.[1] ?? withoutRef;
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
          try: () =>
            resolveSource(source.replace(/^([\w.-]+\/[\w.-]+)\.git(?=#|@|$)/u, "$1"), {
              ref: commit,
            }),
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
      resolveCommit: Effect.fn("Upstream.resolveCommit")(function* (source, ref) {
        // skills@1.8.1 cloneRepo: reject ext::, which executes an arbitrary helper command.
        if (/^ext::/iu.test(source)) {
          return yield* new UpstreamError({ message: "Unsupported Git transport: ext" });
        }
        // Spec #1, Upstream service: full commit Pins require no remote lookup.
        if (ref !== undefined && /^[a-f0-9]{40}$/u.test(ref)) return ref;
        const patterns =
          ref === undefined
            ? ["HEAD"]
            : [`refs/tags/${ref}^{}`, `refs/tags/${ref}`, `refs/heads/${ref}`];
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
        const commit = selectRemoteCommit(stdout, ref);
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
            Effect.map((handle) => handle.skills.map((skill) => skill.name)),
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
