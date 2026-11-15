import { Effect, Schema } from "effect";
import { Argument, CliError, Command, Flag } from "effect/cli";
import { root } from "../root.ts";
import { readSkillset, writeSkillset } from "../skillset-file.ts";

export class RemoveError extends Schema.TaggedError<
  RemoveError,
  { readonly brand: unique symbol }
>()("RemoveError", { message: Schema.String }) {
  override get [CliError.userMessage]() {
    return this.message;
  }
}

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
    // Ticket #6: remove known names even when unknown names make the command fail.
    if (all || remaining.length !== skillset.skills.length) {
      yield* writeSkillset(set, { ...skillset, skills: remaining });
    }
    if (unknown.length > 0) {
      return yield* new RemoveError({ message: `Unknown skills: ${unknown.join(", ")}` });
    }
  }),
).pipe(Command.withDescription("Remove Entries from a Skillset"));
