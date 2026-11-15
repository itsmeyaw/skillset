import { Console, Effect } from "effect";
import { Command } from "effect/cli";
import { root } from "../root.ts";
import { readSkillset, sortedEntries } from "../skillset-file.ts";

// Spec #1, User Story 27: show each Entry's name, Source, and short Pin.
export const list = Command.make(
  "list",
  {},
  Effect.fn(function* () {
    const { set } = yield* root;
    const skillset = yield* readSkillset(set);
    const entries = sortedEntries(skillset.skills);
    if (entries.length === 0) {
      yield* Console.log("This Skillset is empty.");
    } else {
      for (const entry of entries) {
        yield* Console.log(`${entry.name}  ${entry.source}  ${entry.commit.slice(0, 7)}`);
      }
    }
  }),
).pipe(Command.withDescription("List Entries in a Skillset"));
