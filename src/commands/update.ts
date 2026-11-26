import { Console, Effect } from "effect";
import { Argument, Command } from "effect/cli";
import { UpdateError } from "../errors.ts";
import { makePinning } from "../pinning.ts";
import { Upstream } from "../upstream.ts";
import {
  movePin,
  openCommandSkillset,
  selectSkillEntries,
  unknownNamesMessage,
} from "../skillset-store.ts";

// Spec #1, update: move Pins without installing skills.
export const update = Command.make(
  "update",
  { skills: Argument.String("skills").pipe(Argument.variadic()) },
  Effect.fn(function* ({ skills }) {
    const upstream = yield* Upstream;
    return yield* upstream.withSession((session) =>
      Effect.gen(function* () {
        const store = yield* openCommandSkillset({ missing: "fail" });
        let skillset = store.skillset;
        const pinning = yield* makePinning(session);
        // Spec #1, User Story 22: named updates leave all other Skill Entries alone.
        const { skillEntries, unknown } = selectSkillEntries(skillset, skills);
        const changes: Array<string> = [];
        const warnings: Array<string> = [];
        if (unknown.length > 0) warnings.push(unknownNamesMessage(unknown));
        // Spec #1, User Story 24: resolve each distinct Source only once.
        const failed = new Set<string>();
        for (const skillEntry of skillEntries) {
          if (failed.has(skillEntry.source)) continue;
          const result = yield* pinning.latest(skillEntry.source).pipe(
            Effect.catch((error) => {
              warnings.push(`Warning: ${skillEntry.source}: ${error.message}`);
              failed.add(skillEntry.source);
              return Effect.undefined;
            }),
          );
          if (result === undefined) continue;
          const { commit } = result;
          // Spec #1, User Story 26: retain missing Skill Entries and continue updating others.
          if (!result.skills.some((skill) => skill.name === skillEntry.name)) {
            warnings.push(
              `Warning: ${skillEntry.name} not found in ${skillEntry.source} at ${commit}`,
            );
            continue;
          }
          // Spec #1, User Story 23: report only changed Pins.
          if (skillEntry.commit === commit) continue;
          skillset = movePin(skillset, skillEntry.name, commit);
          changes.push(
            `${skillEntry.name}  ${skillEntry.commit.slice(0, 7)} → ${commit.slice(0, 7)}`,
          );
        }
        if (changes.length > 0) yield* store.save(skillset);
        for (const change of changes) yield* Console.log(change);
        if (warnings.length > 0) return yield* new UpdateError({ message: warnings.join("\n") });
      }),
    );
  }),
).pipe(Command.withDescription("Update Skillset Pins"));
