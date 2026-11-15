import { Effect, Stdio } from "effect";
import { Command } from "effect/cli";
import { expandSkillFlags } from "./argv.ts";
import { add } from "./commands/add.ts";
import { list } from "./commands/list.ts";
import { root } from "./root.ts";

export const cli = root.pipe(Command.withSubcommands([add, list]));
export const runArgv = (argv: ReadonlyArray<string>) =>
  Command.runWith(cli, { version: "0.1.0" })(expandSkillFlags(argv));
export const run = Stdio.Stdio.use((stdio) => Effect.flatMap(stdio.args, runArgv));
