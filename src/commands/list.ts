import { Console, Effect } from "effect";
import { Command, Flag } from "effect/cli";
import { emptySkillsetMessage } from "../errors.ts";
import { sortedSkillEntries } from "../skillset-file.ts";
import { isEmpty, listCommandUserSkillsets, openCommandSkillset } from "../skillset-store.ts";

// Spec #1, User Story 27: show each Skill Entry's name, Source, and short Pin.
export const list = Command.make(
  "list",
  { user: Flag.Boolean("user").pipe(Flag.withDefault(false)) },
  Effect.fn(function* ({ user }) {
    // Issue #22: --user lists User Skillsets; -g only means global install scope.
    if (user) {
      for (const name of yield* listCommandUserSkillsets) yield* Console.log(name);
      return;
    }
    const { skillset } = yield* openCommandSkillset({ missing: "fail", allowRemote: true });
    const skillEntries = sortedSkillEntries(skillset.skills);
    if (isEmpty(skillset)) {
      yield* Console.log(emptySkillsetMessage);
    } else {
      for (const skillEntry of skillEntries) {
        yield* Console.log(
          `${skillEntry.name}  ${skillEntry.source}  ${skillEntry.commit.slice(0, 7)}`,
        );
      }
    }
  }),
).pipe(Command.withDescription("List Skill Entries in a Skillset"));
