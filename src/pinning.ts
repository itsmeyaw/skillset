import { Effect } from "effect";
import type { SkillSource } from "skills";
import { ambiguousTreeMessage, CliMessageError, missingSkillsMessage } from "./errors.ts";
import { PIN_PATTERN } from "./pin.ts";
import type { Entry } from "./skillset-file.ts";
import { parseSource, type ParsedSource } from "./source.ts";
import { Upstream } from "./upstream.ts";

type Resolution = {
  source: string;
  commit: string;
  skills: SkillSource["skills"];
  skill: string | undefined;
};

const pinKey = (source: string, commit: string) => JSON.stringify([source, commit]);

// A Pinning instance and its fetched Sources live for one command's scope.
export const makePinning = Effect.fn("makePinning")(function* () {
  const upstream = yield* Upstream;
  const handles = new Map<string, SkillSource>();
  const resolutions = new Map<string, Resolution>();

  const parse = (input: string) => {
    const parsed = parseSource(input);
    return "error" in parsed
      ? Effect.fail(new CliMessageError({ message: parsed.error }))
      : Effect.succeed(parsed);
  };

  const handle = Effect.fn("Pinning.handle")(function* (
    source: string,
    remote: string,
    commit: string,
  ) {
    const key = pinKey(source, commit);
    const cached = handles.get(key);
    if (cached) return cached;
    const fetched = yield* upstream.resolveSource(remote, commit);
    handles.set(key, fetched);
    return fetched;
  });

  const resolveParsed = Effect.fn("Pinning.resolveParsed")(function* (
    input: string,
    parsed: ParsedSource,
  ) {
    const cached = resolutions.get(input);
    if (cached) return cached;
    const isSha = parsed.ref !== undefined && PIN_PATTERN.test(parsed.ref);
    let commit = isSha ? parsed.ref : undefined;
    if (!isSha || parsed.treeRefs?.length) {
      const [resolved, ...longer] = yield* upstream.resolveRefs(parsed.remote, [
        parsed.ref,
        ...(parsed.treeRefs ?? []),
      ]);
      if (longer.some((candidate) => candidate !== undefined))
        return yield* new CliMessageError({ message: ambiguousTreeMessage });
      commit ??= resolved;
    }
    if (commit === undefined)
      return yield* new CliMessageError({
        message: `Ref ${parsed.ref ?? "HEAD"} not found in ${parsed.displayRemote ?? parsed.remote}`,
      });
    const fetched = yield* handle(parsed.stored, parsed.remote, commit);
    const result = { source: parsed.stored, commit, skills: fetched.skills, skill: parsed.skill };
    resolutions.set(input, result);
    return result;
  });

  const resolve = Effect.fn("Pinning.resolve")(function* (input: string) {
    return yield* resolveParsed(input, yield* parse(input));
  });

  const latest = Effect.fn("Pinning.latest")(function* (input: string) {
    const parsed = yield* parse(input);
    if (parsed.fixed) return undefined;
    return yield* resolveParsed(input, parsed);
  });

  const verify = Effect.fn("Pinning.verify")(function* (allEntries: ReadonlyArray<Entry>) {
    const groups = new Map<string, Array<Entry>>();
    for (const entry of allEntries) {
      const key = pinKey(entry.source, entry.commit);
      const group = groups.get(key) ?? [];
      group.push(entry);
      groups.set(key, group);
    }
    const checked = [];
    for (const entries of groups.values()) {
      const first = entries[0];
      if (!first) continue;
      const parsed = yield* parse(first.source);
      const source = yield* handle(first.source, parsed.remote, first.commit);
      const missing = entries.filter(
        (entry) => !source.skills.some((skill) => skill.name === entry.name),
      );
      if (missing.length > 0)
        return yield* new CliMessageError({
          message: missingSkillsMessage(
            first.commit,
            missing.map((entry) => entry.name),
          ),
        });
      checked.push({ source, entries });
    }
    return checked;
  });
  return { resolve, latest, verify };
});

export type Pinning = Effect.Success<ReturnType<typeof makePinning>>;
