import { Effect, Stdio } from "effect";
import { CliConfig, Command, GlobalFlag } from "effect/cli";
import { expandSkillFlags } from "./argv.ts";
import { add } from "./commands/add.ts";
import { install } from "./commands/install.ts";
import { list } from "./commands/list.ts";
import { remove } from "./commands/remove.ts";
import { update } from "./commands/update.ts";
import { root } from "./root.ts";
import { RemoteFetch } from "./remote-skillset.ts";
import { SkillsetEnvironment } from "./skillset-store.ts";
import { Upstream } from "./upstream.ts";
import type { Env } from "./user-skillset.ts";

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
export const runArgv = (
  argv: ReadonlyArray<string>,
  env: Env = process.env,
  fetchRemote: typeof fetch = fetch,
) =>
  Effect.gen(function* () {
    const upstream = yield* Upstream;
    const agents = yield* upstream.getSupportedAgents;
    return yield* Command.runWith(cli, { version })(
      expandSkillFlags(
        argv,
        agents.map((agent) => agent.id),
        cli,
        cliConfig.builtIns,
      ),
    ).pipe(
      Effect.provideService(CliConfig.CliConfig, cliConfig),
      Effect.provideService(SkillsetEnvironment, env),
      Effect.provideService(RemoteFetch, fetchRemote),
    );
  });
export const run = Stdio.Stdio.use((stdio) => Effect.flatMap(stdio.args, runArgv));
import { createRequire } from "node:module";
