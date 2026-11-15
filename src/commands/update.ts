import { Console, Effect } from "effect";
import { Argument, Command } from "effect/cli";
import { CliMessageError as UpdateError } from "../errors.ts";
import { root } from "../root.ts";
import { readSkillset, writeSkillset } from "../skillset-file.ts";
import { parseSource } from "../source.ts";
import { Upstream } from "../upstream.ts";

export { UpdateError };

// Spec #1, update: move Pins without installing skills.
export const update = Command.make(
  "update",
  { skills: Argument.String("skills").pipe(Argument.variadic()) },
  Effect.fn(function* ({ skills }) {
    const { set } = yield* root;
    const skillset = yield* readSkillset(set);
    const upstream = yield* Upstream;
    const entries = [...skillset.skills];
    const changes: Array<string> = [];
    const warnings: Array<string> = [];
    const unknown = skills.filter((name) => !entries.some((entry) => entry.name === name));
    if (unknown.length > 0) warnings.push(`Unknown skills: ${unknown.join(", ")}`);
    // Spec #1, User Story 24: resolve each distinct Source only once.
    const resolved = new Map<string, { commit: string; skills: ReadonlyArray<string> } | null>();
    for (const [index, entry] of entries.entries()) {
      // Spec #1, User Story 22: named updates leave all other Entries alone.
      if (skills.length > 0 && !skills.includes(entry.name)) continue;
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
          const commit = yield* upstream.resolveCommit(
            parsed.repository,
            parsed.ref,
            parsed.treeRefs,
          );
          const skills = yield* upstream.listSkills(parsed.repository, commit);
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
      entries[index] = { ...entry, commit };
      changes.push(`${entry.name}  ${entry.commit.slice(0, 7)} → ${commit.slice(0, 7)}`);
    }
    if (changes.length > 0) yield* writeSkillset(set, { ...skillset, skills: entries });
    for (const change of changes) yield* Console.log(change);
    if (warnings.length > 0) return yield* new UpdateError({ message: warnings.join("\n") });
  }),
).pipe(Command.withDescription("Update Skillset Pins"));
