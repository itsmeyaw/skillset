import { Effect } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import { CliMessageError as RemoveError } from "../errors.ts";
import { root } from "../root.ts";
import { readSkillset, writeSkillset } from "../skillset-file.ts";

export { RemoveError };

// Spec #1, User Story 17: removing Entries changes only the Skillset file.
export const remove = Command.make(
  "remove",
  {
    skills: Argument.String("skills").pipe(Argument.variadic()),
    all: Flag.Boolean("all").pipe(Flag.withDefault(false)),
  },
  Effect.fn(function* ({ skills, all }) {
    // Spec #1, User Story 19: an empty selection must not remove anything.
    if (!all && skills.length === 0) {
      return yield* new RemoveError({ message: "Usage: skillset remove [skills...] [--all]" });
    }
    const { set } = yield* root;
    const skillset = yield* readSkillset(set);
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
