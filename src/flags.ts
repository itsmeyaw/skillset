import { Flag } from "effect/cli";
import { Expansion } from "./argv.ts";

export const agents = (positional?: (value: string) => boolean) =>
  Flag.String("agent").pipe(
    Flag.withAlias("a"),
    Flag.annotate(Expansion, {
      // Issue #13: only supported agent IDs extend a space-separated agent flag.
      accepts: (value, agentIds) => agentIds.includes(value),
      positional,
    }),
    Flag.atLeast(0),
  );
