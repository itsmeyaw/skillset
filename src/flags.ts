import { Flag } from "effect/cli";
import { Expansion } from "./argv.ts";

export const agents = Flag.String("agent").pipe(
  Flag.withAlias("a"),
  Flag.annotate(Expansion, { accepts: (value, agentIds) => agentIds.includes(value) }),
  Flag.atLeast(0),
);
