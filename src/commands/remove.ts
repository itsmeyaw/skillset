import { Console, Effect } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import { CliMessageError as RemoveError, emptySkillsetMessage } from "../errors.ts";
import { cancelOnQuit } from "../prompts/cancel.ts";
import { isInteractive } from "../prompts/interactive.ts";
import { searchMultiSelect } from "../prompts/search.ts";
import {
  isEmpty,
  openCommandSkillset,
  removeEntries,
  selectEntries,
  unknownNamesMessage,
} from "../skillset-store.ts";

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
    const store = yield* openCommandSkillset({ missing: "fail" });
    const { skillset } = store;
    let skills: ReadonlyArray<string> = supplied;
    // Issue #11: select Entries only when an interactive removal is ambiguous.
    if (!all && skills.length === 0) {
      if (isEmpty(skillset)) {
        yield* Console.log(emptySkillsetMessage);
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
    const { unknown } = selectEntries(skillset, skills);
    const remaining = removeEntries(
      skillset,
      all ? skillset.skills.map((entry) => entry.name) : skills,
    );
    // Spec #1, User Story 20: report unknown names after removing known Entries.
    if (all || remaining.skills.length !== skillset.skills.length) {
      yield* store.save(remaining);
      const removed = skillset.skills.filter((entry) => !remaining.skills.includes(entry));
      if (removed.length > 0)
        yield* Console.log(
          `Removed ${removed.map((entry) => entry.name).join(", ")} from ${store.path}`,
        );
    }
    if (unknown.length > 0) {
      return yield* new RemoveError({ message: unknownNamesMessage(unknown) });
    }
  }),
).pipe(Command.withDescription("Remove Entries from a Skillset"));
