import { Console, Effect } from "effect";
import { Argument, Command } from "effect/cli";
import { CliMessageError as UpdateError } from "../errors.ts";
import {
  movePin,
  openCommandSkillset,
  selectEntries,
  unknownNamesMessage,
} from "../skillset-store.ts";
import { parseSource } from "../source.ts";
import { Upstream } from "../upstream.ts";

// Spec #1, update: move Pins without installing skills.
export const update = Command.make(
  "update",
  { skills: Argument.String("skills").pipe(Argument.variadic()) },
  Effect.fn(function* ({ skills }) {
    const store = yield* openCommandSkillset({ missing: "fail" });
    let skillset = store.skillset;
    const upstream = yield* Upstream;
    // Spec #1, User Story 22: named updates leave all other Entries alone.
    const { entries, unknown } = selectEntries(skillset, skills);
    const changes: Array<string> = [];
    const warnings: Array<string> = [];
    if (unknown.length > 0) warnings.push(unknownNamesMessage(unknown));
    // Spec #1, User Story 24: resolve each distinct Source only once.
    const resolved = new Map<string, { commit: string; skills: ReadonlyArray<string> } | null>();
    for (const entry of entries) {
      const parsed = parseSource(entry.source);
      if ("error" in parsed) {
        warnings.push(`Warning: ${entry.source}: ${parsed.error}`);
        continue;
      }
      // Spec #1, User Story 25: tagged and SHA Sources stay fixed.
      if (parsed.fixed) continue;
      let result = resolved.get(entry.source);
      if (result === undefined) {
        // Spec #1, User Story 26: a failed Source must not block other Sources.
        result = yield* Effect.gen(function* () {
          const commit = yield* upstream.resolveCommit(parsed.remote, parsed.ref, parsed.treeRefs);
          const skills = (yield* upstream.listSkills(parsed.remote, commit)).map(
            (skill) => skill.name,
          );
          return { commit, skills };
        }).pipe(
          Effect.catch((error) => {
            warnings.push(`Warning: ${entry.source}: ${error.message}`);
            return Effect.succeed(null);
          }),
        );
        resolved.set(entry.source, result);
      }
      if (result === null) continue;
      const { commit } = result;
      // Spec #1, User Story 26: retain missing Entries and continue updating others.
      if (!result.skills.includes(entry.name)) {
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
).pipe(Command.withDescription("Update Skillset Pins"));
