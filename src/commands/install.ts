import { Effect, Option } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import { Expansion } from "../argv.ts";
import { agents } from "../agent-flag.ts";
import { installSkillset } from "../install.ts";
import { makePrompter } from "../prompts/prompter.ts";
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
    agents: agents(),
    global: Flag.Boolean("global").pipe(Flag.withAlias("g"), Flag.withDefault(false)),
    copy: Flag.Boolean("copy").pipe(Flag.withDefault(false)),
    yes: Flag.Boolean("yes").pipe(Flag.withAlias("y"), Flag.withDefault(false)),
  },
  Effect.fn(function* (options) {
    const store = yield* openCommandSkillset({
      positional: Option.getOrUndefined(options.set),
      missing: "fail",
      install: true,
    });
    const upstream = yield* Upstream;
    const prompter = yield* makePrompter(options.yes);
    if (store.remote && !options.yes && !(yield* prompter.confirmRemote(store.skillset.skills)))
      return;
    return yield* upstream.withSession((session) =>
      installSkillset(store.skillset, options, session, prompter),
    );
  }),
).pipe(
  Command.withDescription("Install pinned Skill Entries from a name, .json path, or HTTPS URL"),
);
