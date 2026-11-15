import { Console, Effect, FileSystem, Schema } from "effect";
import { Argument, CliError, Command, Flag } from "effect/cli";
import { root } from "../root.ts";
import { readSkillset, SCHEMA_URL, SkillsetFileError, writeSkillset } from "../skillset-file.ts";
import type { Skillset } from "../skillset-file.ts";
import { parseSource } from "../source.ts";
import { Upstream } from "../upstream.ts";

export class AddError extends Schema.TaggedError<AddError, { readonly brand: unique symbol }>()(
  "AddError",
  { message: Schema.String },
) {
  override get [CliError.userMessage]() {
    return this.message;
  }
}

// Spec #1, add: list skills without changing the Skillset when no selection is given.
export const add = Command.make(
  "add",
  {
    source: Argument.String("source"),
    selected: Flag.String("skill").pipe(Flag.withAlias("s"), Flag.atLeast(0)),
    all: Flag.Boolean("all").pipe(Flag.withDefault(false)),
    list: Flag.Boolean("list").pipe(Flag.withAlias("l"), Flag.withDefault(false)),
  },
  Effect.fn(function* ({ source, selected, all, list }) {
    const parsed = parseSource(source);
    if ("error" in parsed) return yield* new AddError({ message: parsed.error });
    const upstream = yield* Upstream;
    const commit = yield* upstream.resolveCommit(parsed.repository, parsed.ref, parsed.treeRefs);
    const skills = yield* upstream.listSkills(parsed.repository, commit);
    // Spec #1, Source parsing: -s or --all overrides an implied tree-path selection.
    const selection = selected.length > 0 ? selected : !all && parsed.skill ? [parsed.skill] : [];
    if (list || (!all && selection.length === 0)) {
      for (const skill of skills) yield* Console.log(skill);
      yield* Console.log("Use -s to select skills or --all to add every skill.");
      return;
    }
    // Spec #1, User Story 14: reject absent skills before writing anything.
    const missing = selection.filter((name) => !skills.includes(name));
    if (missing.length > 0)
      return yield* new AddError({
        message: `Skills not found at ${commit}: ${missing.join(", ")}`,
      });
    const { set } = yield* root;
    const fs = yield* FileSystem.FileSystem;
    // Spec #1, add: only add treats a missing Skillset file as empty.
    const exists = yield* fs.exists(set).pipe(
      Effect.mapError(
        (error) =>
          new SkillsetFileError({
            message: `Cannot read Skillset file ${set}: ${error.message}`,
          }),
      ),
    );
    const skillset: Skillset = exists
      ? yield* readSkillset(set)
      : { $schema: SCHEMA_URL, skills: [] };
    // Spec #1, User Story 16: re-adding an Entry from the same Source moves its Pin.
    // Spec #1, User Story 4: --all selects every skill at the resolved commit.
    const names = new Set(all ? skills : selection);
    // Spec #1, User Story 15: a name from a different Source must never be overwritten.
    const conflict = skillset.skills.find(
      (entry) => names.has(entry.name) && entry.source !== parsed.stored,
    );
    if (conflict)
      return yield* new AddError({
        message: `Skill ${conflict.name} already belongs to ${conflict.source}`,
      });
    yield* writeSkillset(set, {
      ...skillset,
      skills: [
        ...skillset.skills.filter((entry) => !names.has(entry.name)),
        ...Array.from(names, (name) => ({ name, source: parsed.stored, commit })),
      ],
    });
  }),
).pipe(Command.withDescription("Add skills from a Source"));
