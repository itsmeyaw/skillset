import { Console, Effect, Option } from "effect";
import { Command, Flag } from "effect/cli";
import { CliMessageError as ListError, emptySkillsetMessage } from "../errors.ts";
import { root } from "../root.ts";
import { readSkillset, sortedEntries } from "../skillset-file.ts";
import { listUserSkillsets, resolveSet } from "../user-skillset.ts";

export { ListError };

// Spec #1, User Story 27: show each Entry's name, Source, and short Pin.
export const list = Command.make(
  "list",
  { user: Flag.Boolean("user").pipe(Flag.withDefault(false)) },
  Effect.fn(function* ({ user }) {
    const { set: setFlag } = yield* root;
    // Issue #22: --user lists User Skillsets; -g only means global install scope.
    if (user) {
      if (Option.isSome(setFlag))
        return yield* new ListError({ message: "--user cannot be used with --set." });
      for (const name of yield* listUserSkillsets()) yield* Console.log(name);
      return;
    }
    const skillset = yield* readSkillset(yield* resolveSet(setFlag));
    const entries = sortedEntries(skillset.skills);
    if (entries.length === 0) {
      yield* Console.log(emptySkillsetMessage);
    } else {
      for (const entry of entries) {
        yield* Console.log(`${entry.name}  ${entry.source}  ${entry.commit.slice(0, 7)}`);
      }
    }
  }),
).pipe(Command.withDescription("List Entries in a Skillset"));
