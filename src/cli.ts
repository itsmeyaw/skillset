import { Effect, Stdio } from "effect";
import { Command } from "effect/cli";
import { list } from "./commands/list.ts";
import { remove } from "./commands/remove.ts";
import { root } from "./root.ts";

export const cli = root.pipe(Command.withSubcommands([list, remove]));
export const runArgv = (argv: ReadonlyArray<string>) =>
  Command.runWith(cli, { version: "0.1.0" })(argv);
export const run = Stdio.Stdio.use((stdio) => Effect.flatMap(stdio.args, runArgv));
