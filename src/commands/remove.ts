import { Console, Effect } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import { CliMessageError as RemoveError, emptySkillsetMessage } from "../errors.ts";
import { makePrompter, type RemovePrompter } from "../prompts/prompter.ts";
import {
  isEmpty,
  openCommandSkillset,
  removeSkillEntries,
  selectSkillEntries,
  unknownNamesMessage,
} from "../skillset-store.ts";

const usage = "Usage: skillset skill rm [skills...] [--all]";

// Spec #1, User Story 17: removing Skill Entries changes only the Skillset file.
export const remove = Command.make(
  "remove",
  {
    skills: Argument.String("skills").pipe(Argument.variadic()),
    all: Flag.Boolean("all").pipe(Flag.withDefault(false)),
    yes: Flag.Boolean("yes").pipe(Flag.withAlias("y"), Flag.withDefault(false)),
  },
  Effect.fn(function* ({ skills: supplied, all, yes }) {
    const prompter: RemovePrompter = yield* makePrompter(yes);
    // Spec #1, User Story 19: an empty selection must not remove anything.
    if (!all && supplied.length === 0 && !prompter.canSelect)
      return yield* new RemoveError({ message: usage });
    const store = yield* openCommandSkillset({ missing: "fail" });
    const { skillset } = store;
    let skills: ReadonlyArray<string> = supplied;
    // Issue #11: select Skill Entries only when an interactive removal is ambiguous.
    if (!all && skills.length === 0) {
      if (isEmpty(skillset)) {
        yield* Console.log(emptySkillsetMessage);
        return;
      }
      const chosen = yield* prompter.skills(
        skillset.skills.map((skillEntry) => ({
          title: skillEntry.name,
          value: skillEntry.name,
          description: skillEntry.source,
        })),
      );
      if (!chosen || chosen.length === 0) return;
      skills = chosen;
    }
    const { unknown } = selectSkillEntries(skillset, skills);
    const next = removeSkillEntries(
      skillset,
      all ? skillset.skills.map((skillEntry) => skillEntry.name) : skills,
    );
    // Spec #1, User Story 20: report unknown names after removing known Skill Entries.
    if (all || next.skills.length !== skillset.skills.length) {
      yield* store.save(next);
      const removed = skillset.skills.filter((skillEntry) => !next.skills.includes(skillEntry));
      if (removed.length > 0)
        yield* Console.log(
          `Removed ${removed.map((skillEntry) => skillEntry.name).join(", ")} from ${store.path}`,
        );
    }
    if (unknown.length > 0) {
      return yield* new RemoveError({ message: unknownNamesMessage(unknown) });
    }
  }),
).pipe(Command.withDescription("Remove Skill Entries from a Skillset"));
