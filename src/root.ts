import { Command, Flag } from "effect/cli";

// Spec #1, Commands: --set defaults to ./skillset.json on every command.
export const root = Command.make("skillset").pipe(
  Command.withSharedFlags({ set: Flag.String("set").pipe(Flag.withDefault("./skillset.json")) }),
  Command.withDescription("Skillset management CLI"),
);
