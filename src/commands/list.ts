import { Console, Effect } from "effect";
import { Command, Flag } from "effect/cli";
import { emptySkillsetMessage } from "../errors.ts";
import { sortedEntries } from "../skillset-file.ts";
import { isEmpty, listCommandUserSkillsets, openCommandSkillset } from "../skillset-store.ts";

// Spec #1, User Story 27: show each Entry's name, Source, and short Pin.
export const list = Command.make(
  "list",
  { user: Flag.Boolean("user").pipe(Flag.withDefault(false)) },
  Effect.fn(function* ({ user }) {
    // Issue #22: --user lists User Skillsets; -g only means global install scope.
    if (user) {
      for (const name of yield* listCommandUserSkillsets) yield* Console.log(name);
      return;
    }
    const { skillset } = yield* openCommandSkillset({ missing: "fail" });
    const entries = sortedEntries(skillset.skills);
    if (isEmpty(skillset)) {
      yield* Console.log(emptySkillsetMessage);
    } else {
      for (const entry of entries) {
        yield* Console.log(`${entry.name}  ${entry.source}  ${entry.commit.slice(0, 7)}`);
      }
    }
  }),
).pipe(Command.withDescription("List Entries in a Skillset"));
