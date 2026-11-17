import { Effect, Scope } from "effect";
import { missingSkillsMessage } from "./errors.ts";
import { parseSource } from "./source.ts";
import {
  UpstreamError,
  type InstallChoices,
  type InstallOutcome,
  type UpstreamSession,
} from "./upstream.ts";

type Source = {
  readonly skills: ReadonlyArray<{ readonly name: string; readonly description: string }>;
};

export const withUpstreamSession = <Handle extends Source, A, E, R>(
  fetch: (remote: string, commit: string) => Effect.Effect<Handle, UpstreamError, Scope.Scope>,
  write: (
    source: Handle,
    names: ReadonlyArray<string>,
    choices: InstallChoices,
  ) => Effect.Effect<InstallOutcome, UpstreamError>,
  use: (session: UpstreamSession) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.scoped(
    Effect.gen(function* () {
      const scope = yield* Effect.scope;
      const cache = new Map<string, Handle>();
      const getScoped = Effect.fn("Upstream.source")(function* (remote: string, commit: string) {
        const key = JSON.stringify([remote, commit]);
        const cached = cache.get(key);
        if (cached) return cached;
        const source = yield* fetch(remote, commit);
        cache.set(key, source);
        return source;
      });
      const get = (remote: string, commit: string) =>
        getScoped(remote, commit).pipe(Effect.provideService(Scope.Scope, scope));
      const session: UpstreamSession = {
        list: (remote, commit) => get(remote, commit).pipe(Effect.map((source) => source.skills)),
        install: Effect.fn("Upstream.install")(function* (entries, choices) {
          const groups = new Map<
            string,
            { remote: string; commit: string; names: Array<string> }
          >();
          for (const entry of entries) {
            const parsed = parseSource(entry.source);
            if ("error" in parsed) return yield* new UpstreamError({ message: parsed.error });
            const key = JSON.stringify([parsed.remote, entry.commit]);
            const group = groups.get(key) ?? {
              remote: parsed.remote,
              commit: entry.commit,
              names: [],
            };
            group.names.push(entry.name);
            groups.set(key, group);
          }
          const checked: Array<{ source: Handle; names: Array<string> }> = [];
          for (const group of groups.values()) {
            const source = yield* get(group.remote, group.commit);
            const missing = group.names.filter(
              (name) => !source.skills.some((skill) => skill.name === name),
            );
            if (missing.length > 0)
              return yield* new UpstreamError({
                message: missingSkillsMessage(group.commit, missing),
              });
            checked.push({ source, names: group.names });
          }
          const installed: Array<InstallOutcome["installed"][number]> = [];
          const skipped: Array<InstallOutcome["skipped"][number]> = [];
          const failed: Array<InstallOutcome["failed"][number]> = [];
          for (const group of checked) {
            const result = yield* write(group.source, group.names, choices);
            installed.push(...result.installed);
            skipped.push(...result.skipped);
            failed.push(...result.failed);
            if (result.failed.length > 0) break;
          }
          return { installed, skipped, failed };
        }),
      };
      return yield* use(session);
    }),
  );
