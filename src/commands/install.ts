import { Effect, Option } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import { Expansion } from "../argv.ts";
import { installFlags, installSkillset } from "../install.ts";
import { makePrompter, type InstallPrompter, type RemotePrompter } from "../prompts/prompter.ts";
import { openCommandSkillset } from "../skillset-store.ts";
import { Upstream } from "../upstream.ts";

// Spec #1, install -y: omitted agents use shared defaults, project scope, and auto mode.
export const install = Command.make(
  "install",
  {
    set: Argument.String("set").pipe(Argument.optional),
    selected: Flag.String("skill").pipe(
      Flag.withAlias("s"),
      Flag.annotate(Expansion, { reserveLast: true }),
      Flag.atLeast(0),
    ),
    selectedMcp: Flag.String("mcp").pipe(
      Flag.withAlias("m"),
      Flag.annotate(Expansion, { reserveLast: true }),
      Flag.atLeast(0),
    ),
    ...installFlags(),
  },
  Effect.fn(function* (options) {
    const store = yield* openCommandSkillset({
      positional: Option.getOrUndefined(options.set),
      missing: "fail",
      install: true,
    });
    const upstream = yield* Upstream;
    const prompter: InstallPrompter & RemotePrompter = yield* makePrompter(options.yes);
    if (store.remote && !options.yes && !(yield* prompter.confirmRemote(store.skillset))) return;
    return yield* upstream.withSession((session) =>
      installSkillset(store.skillset, options, session, prompter),
    );
  }),
).pipe(
  Command.withDescription(
    "Install Skill Entries and MCP Entries from a name, .json path, or HTTPS URL",
  ),
);
