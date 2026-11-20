import { Command, Flag } from "effect/cli";
import { Expansion } from "./argv.ts";

// Spec #1, Commands: --set defaults to ./skillset.json on every command.
// Issue #12: left optional so `install <name>` and `ls -g` can tell an explicit --set.
export const root = Command.make("skillset").pipe(
  Command.withSharedFlags({
    set: Flag.String("set").pipe(
      Flag.withDescription(
        "Skillset .json path or User Skillset name; an HTTPS URL works for install and ls only",
      ),
      Flag.annotate(Expansion, { blocksReserved: true }),
      Flag.optional,
    ),
  }),
  Command.withDescription("Skillset management CLI"),
);
