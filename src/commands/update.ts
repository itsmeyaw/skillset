import { Console, Effect } from "effect";
import { Argument, Command } from "effect/cli";
import { CliMessageError as UpdateError } from "../errors.ts";
import { makePinning } from "../pinning.ts";
import {
  movePin,
  openCommandSkillset,
  selectEntries,
  unknownNamesMessage,
} from "../skillset-store.ts";

// Spec #1, update: move Pins without installing skills.
export const update = Command.make(
  "update",
  { skills: Argument.String("skills").pipe(Argument.variadic()) },
  Effect.fn(function* ({ skills }) {
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const store = yield* openCommandSkillset({ missing: "fail" });
        let skillset = store.skillset;
        const pinning = yield* makePinning();
        // Spec #1, User Story 22: named updates leave all other Entries alone.
        const { entries, unknown } = selectEntries(skillset, skills);
        const changes: Array<string> = [];
        const warnings: Array<string> = [];
        if (unknown.length > 0) warnings.push(unknownNamesMessage(unknown));
        // Spec #1, User Story 24: resolve each distinct Source only once.
        const failed = new Set<string>();
        for (const entry of entries) {
          if (failed.has(entry.source)) continue;
          const result = yield* pinning.latest(entry.source).pipe(
            Effect.catch((error) => {
              warnings.push(`Warning: ${entry.source}: ${error.message}`);
              failed.add(entry.source);
              return Effect.undefined;
            }),
          );
          if (result === undefined) continue;
          const { commit } = result;
          // Spec #1, User Story 26: retain missing Entries and continue updating others.
          if (!result.skills.some((skill) => skill.name === entry.name)) {
            warnings.push(`Warning: ${entry.name} not found in ${entry.source} at ${commit}`);
            continue;
          }
          // Spec #1, User Story 23: report only changed Pins.
          if (entry.commit === commit) continue;
          skillset = movePin(skillset, entry.name, commit);
          changes.push(`${entry.name}  ${entry.commit.slice(0, 7)} → ${commit.slice(0, 7)}`);
        }
        if (changes.length > 0) yield* store.save(skillset);
        for (const change of changes) yield* Console.log(change);
        if (warnings.length > 0) return yield* new UpdateError({ message: warnings.join("\n") });
      }),
    );
  }),
).pipe(Command.withDescription("Update Skillset Pins"));
