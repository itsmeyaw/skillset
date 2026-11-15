import { Effect, Stdio } from "effect";
import { Command } from "effect/cli";
import { expandSkillFlags } from "./argv.ts";
import { add } from "./commands/add.ts";
import { install } from "./commands/install.ts";
import { list } from "./commands/list.ts";
import { remove } from "./commands/remove.ts";
import { update } from "./commands/update.ts";
import { root } from "./root.ts";

export const cli = root.pipe(Command.withSubcommands([add, install, list, remove, update]));
const { version } = createRequire(import.meta.url)("../package.json") as { version: string };
export const runArgv = (argv: ReadonlyArray<string>) =>
  Command.runWith(cli, { version })(expandSkillFlags(argv));
export const run = Stdio.Stdio.use((stdio) => Effect.flatMap(stdio.args, runArgv));
import { createRequire } from "node:module";
