import { Effect, Option } from "effect";
import { Argument, Command, Flag, Prompt } from "effect/cli";
import { prepareAddition } from "../addition.ts";
import { CliMessageError as AddError } from "../errors.ts";
import { cancelOnQuit } from "../prompts/cancel.ts";
import { isInteractive } from "../prompts/interactive.ts";
import { root } from "../root.ts";
import { writeSkillset } from "../skillset-file.ts";

export { AddError };

// Spec #1, add: list skills without changing the Skillset when no selection is given.
export const add = Command.make(
  "add",
  {
    source: Argument.String("source").pipe(Argument.optional),
    selected: Flag.String("skill").pipe(Flag.withAlias("s"), Flag.atLeast(0)),
    all: Flag.Boolean("all").pipe(Flag.withDefault(false)),
    list: Flag.Boolean("list").pipe(Flag.withAlias("l"), Flag.withDefault(false)),
    yes: Flag.Boolean("yes").pipe(Flag.withAlias("y"), Flag.withDefault(false)),
  },
  Effect.fn(function* ({ source, selected, all, list, yes }) {
    const interactive = yield* isInteractive(yes);
    if (Option.isNone(source) && !interactive)
      return yield* new AddError({ message: "Usage: skillset add <source>" });
    const input = Option.isSome(source)
      ? source.value
      : yield* cancelOnQuit(Prompt.String({ message: "Source?" }));
    const { set } = yield* root;
    const addition = yield* prepareAddition(input, set, { selected, all, list, interactive });
    if (addition._tag === "Addition") yield* writeSkillset(set, addition.skillset);
  }),
).pipe(Command.withDescription("Add skills from a Source"));
