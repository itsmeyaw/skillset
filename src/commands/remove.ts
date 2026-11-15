import { Console, Effect } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import { CliMessageError as RemoveError } from "../errors.ts";
import { cancelOnQuit } from "../prompts/cancel.ts";
import { isInteractive } from "../prompts/interactive.ts";
import { searchMultiSelect } from "../prompts/search.ts";
import { root } from "../root.ts";
import { readSkillset, writeSkillset } from "../skillset-file.ts";

export { RemoveError };

// Spec #1, User Story 17: removing Entries changes only the Skillset file.
export const remove = Command.make(
  "remove",
  {
    skills: Argument.String("skills").pipe(Argument.variadic()),
    all: Flag.Boolean("all").pipe(Flag.withDefault(false)),
    yes: Flag.Boolean("yes").pipe(Flag.withAlias("y"), Flag.withDefault(false)),
  },
  Effect.fn(function* ({ skills: supplied, all, yes }) {
    const interactive = yield* isInteractive(yes);
    // Spec #1, User Story 19: an empty selection must not remove anything.
    if (!all && supplied.length === 0 && !interactive) {
      return yield* new RemoveError({ message: "Usage: skillset remove [skills...] [--all]" });
    }
    const { set } = yield* root;
    const skillset = yield* readSkillset(set);
    let skills: ReadonlyArray<string> = supplied;
    // Issue #11: select Entries only when an interactive removal is ambiguous.
    if (!all && skills.length === 0) {
      if (skillset.skills.length === 0) {
        yield* Console.log("This Skillset is empty.");
        return;
      }
      skills = yield* cancelOnQuit(
        searchMultiSelect({
          message: "Which skills?",
          choices: skillset.skills.map((entry) => ({
            title: entry.name,
            value: entry.name,
            description: entry.source,
          })),
        }),
      );
      if (skills.length === 0) return;
    }
    const unknown = skills.filter((name) => !skillset.skills.some((entry) => entry.name === name));
    const remaining = all ? [] : skillset.skills.filter((entry) => !skills.includes(entry.name));
    // Spec #1, User Story 20: report unknown names after removing known Entries.
    if (all || remaining.length !== skillset.skills.length) {
      yield* writeSkillset(set, { ...skillset, skills: remaining });
    }
    if (unknown.length > 0) {
      return yield* new RemoveError({ message: `Unknown skills: ${unknown.join(", ")}` });
    }
  }),
).pipe(Command.withDescription("Remove Entries from a Skillset"));
