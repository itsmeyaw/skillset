import { Effect, Stdio } from "effect";
import { CliConfig, Command, GlobalFlag } from "effect/cli";
import { expandSkillFlags } from "./argv.ts";
import { add } from "./commands/add.ts";
import { install } from "./commands/install.ts";
import { list } from "./commands/list.ts";
import { remove } from "./commands/remove.ts";
import { update } from "./commands/update.ts";
import { root } from "./root.ts";
import { SkillsetEnvironment, type Env } from "./skillset-store.ts";

// Issue #11: aliases share the same command handlers as their long names.
export const cli = root.pipe(
  Command.withSubcommands([
    add.pipe(Command.withAlias("a")),
    install.pipe(Command.withAlias("i")),
    list.pipe(Command.withAlias("ls")),
    remove.pipe(Command.withAlias("rm")),
    update.pipe(Command.withAlias("up")),
  ]),
);
// Issue #11: the built-in wizard is not part of the CLI.
export const cliConfig = CliConfig.make({
  builtIns: GlobalFlag.BuiltIns.filter((flag) => flag !== GlobalFlag.Wizard),
});
const { version } = createRequire(import.meta.url)("../package.json") as { version: string };
export const runArgv = (argv: ReadonlyArray<string>, env: Env = process.env) =>
  Command.runWith(cli, { version })(expandSkillFlags(argv)).pipe(
    Effect.provideService(CliConfig.CliConfig, cliConfig),
    Effect.provideService(SkillsetEnvironment, env),
  );
export const run = Stdio.Stdio.use((stdio) => Effect.flatMap(stdio.args, runArgv));
import { createRequire } from "node:module";
