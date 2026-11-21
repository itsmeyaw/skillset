import { Effect } from "effect";
import { ambiguousTreeMessage, UpstreamError } from "./errors.ts";
import { PIN_PATTERN } from "./pin.ts";
import { parseSource, type ParsedSource } from "./source.ts";
import { Upstream, type UpstreamSession } from "./upstream.ts";

type Resolution = {
  source: string;
  commit: string;
  skills: ReadonlyArray<{ readonly name: string; readonly description: string }>;
  skill: string | undefined;
};

export const makePinning = Effect.fn("makePinning")(function* (session: UpstreamSession) {
  const upstream = yield* Upstream;
  const resolutions = new Map<string, Resolution>();

  const parse = (input: string) => {
    const parsed = parseSource(input);
    return "error" in parsed
      ? Effect.fail(new UpstreamError({ message: parsed.error }))
      : Effect.succeed(parsed);
  };

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
        return yield* new UpstreamError({ message: ambiguousTreeMessage });
      commit ??= resolved;
    }
    if (commit === undefined)
      return yield* new UpstreamError({
        message: `Ref ${parsed.ref ?? "HEAD"} not found in ${parsed.displayRemote ?? parsed.remote}`,
      });
    const skills = yield* session.list(parsed.remote, commit);
    const result = { source: parsed.stored, commit, skills, skill: parsed.skill };
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

  return { resolve, latest };
});

export type Pinning = Effect.Success<ReturnType<typeof makePinning>>;
