import { Flag } from "effect/cli";
import { Expansion } from "./argv.ts";

export const agents = (positional?: (value: string) => boolean) =>
  Flag.String("agent").pipe(
    Flag.withAlias("a"),
    Flag.annotate(Expansion, {
      accepts: (value, agentIds) => agentIds.includes(value),
      positional,
    }),
    Flag.atLeast(0),
  );
