import { dirname } from "node:path";
import { Effect, FileSystem, JsonSchema, Schema } from "effect";
import { CliMessageError as SkillsetFileError } from "./errors.ts";
import { PIN_PATTERN } from "./pin.ts";

// Spec #1, Skillset file format: the schema URL is also the format version.
export const SCHEMA_URL =
  "https://raw.githubusercontent.com/itsmeyaw/skillset/main/schemas/skillset/v1.json";

// ECMA-48 §4.1: control characters can introduce terminal control functions.
const skillEntryText = Schema.String.check(
  Schema.isNonEmpty(),
  Schema.isPattern(/^\P{Cc}+$/u, {
    // JSON Schema 2020-12 §6.4: use portable ranges for Unicode control characters.
    toJsonSchema: () => ({ not: { pattern: "[\\u0000-\\u001f\\u007f-\\u009f]" } }),
  }),
);

export const SkillEntry = Schema.Struct({
  name: skillEntryText,
  source: skillEntryText,
  commit: Schema.String.check(
    Schema.isPattern(PIN_PATTERN, {
      message: "Expected a full 40-character lowercase commit SHA",
    }),
  ),
});

// Spec #1, Skillset file format: names are unique and Pins are full lowercase SHAs.
export const Skillset = Schema.Struct({
  $schema: Schema.Literal(SCHEMA_URL),
  skills: Schema.Array(SkillEntry).check(
    Schema.makeFilter((skillEntries) => {
      const names = new Set<string>();
      for (const [index, skillEntry] of skillEntries.entries()) {
        if (names.has(skillEntry.name))
          return { path: [index, "name"], issue: `Duplicate skill name "${skillEntry.name}"` };
        names.add(skillEntry.name);
      }
      return undefined;
    }),
  ),
}).annotate({
  title: "Skillset",
  description: "A curated list of agent skills pinned to commits.",
});

export type Skillset = typeof Skillset.Type;
export type SkillEntry = typeof SkillEntry.Type;

// Spec #1, Schema module: publish the same definition used to validate Skillset files.
export const skillsetJsonSchema = (): string => {
  const document = Schema.toJsonSchemaDocument(Skillset, { onExcessProperty: "error" });
  return (
    JSON.stringify(
      {
        $schema: JsonSchema.META_SCHEMA_URI_DRAFT_2020_12,
        ...document.schema,
        ...(Object.keys(document.definitions).length > 0 ? { $defs: document.definitions } : {}),
      },
      null,
      2,
    ) + "\n"
  );
};

const invalidSkillset = (path: string) => (error: { readonly message: string }) =>
  new SkillsetFileError({ message: `Invalid Skillset file ${path}: ${error.message}` });

export const cannotReadSkillset = (path: string) => (error: { readonly message: string }) =>
  new SkillsetFileError({ message: `Cannot read Skillset file ${path}: ${error.message}` });

// Spec #1, Skillset file module: reject invalid content and unknown versions before acting.
export const parseSkillset = (text: string, label: string) =>
  Schema.decodeEffect(Schema.fromJsonString(Skillset))(text, {
    onExcessProperty: "error",
  }).pipe(Effect.mapError(invalidSkillset(label)));

export const readSkillset = Effect.fn("readSkillset")(function* (path: string) {
  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs.readFileString(path).pipe(Effect.mapError(cannotReadSkillset(path)));
  return yield* parseSkillset(text, path);
});

// Spec #1, Skillset file format: canonical order is independent of input order.
export const sortedSkillEntries = (skillEntries: ReadonlyArray<SkillEntry>): Array<SkillEntry> =>
  [...skillEntries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

// Spec #1, Skillset file format: write sorted Skill Entries with two-space indentation and a newline.
export const writeSkillset = Effect.fn("writeSkillset")(function* (
  path: string,
  skillset: Skillset,
) {
  const fs = yield* FileSystem.FileSystem;
  const validated = yield* Schema.decodeEffect(Skillset)(skillset, {
    onExcessProperty: "error",
  }).pipe(Effect.mapError(invalidSkillset(path)));
  const saved = { $schema: validated.$schema, skills: sortedSkillEntries(validated.skills) };
  const content = JSON.stringify(saved, null, 2) + "\n";
  yield* Effect.gen(function* () {
    const tmp = `${path}.tmp`;
    // Issue #12: create missing parent directories so a first write to the user directory works.
    yield* fs.makeDirectory(dirname(path), { recursive: true });
    // POSIX chmod(2): retain existing access permissions when replacing the file.
    const mode = (yield* fs.exists(path)) ? (yield* fs.stat(path)).mode & 0o7777 : undefined;
    // POSIX open(2): O_EXCL prevents following or sharing an existing temporary file.
    // shortcut: stale temporary files block saves; use unique names to allow retries.
    yield* fs.writeFileString(tmp, content, { flag: "wx", mode });
    if (mode !== undefined) yield* fs.chmod(tmp, mode);
    // POSIX rename(2): replacing a file atomically exposes either the old or new content.
    yield* fs.rename(tmp, path);
  }).pipe(
    Effect.mapError(
      (error) =>
        new SkillsetFileError({
          message: `Cannot write Skillset file ${path}: ${error.message}`,
        }),
    ),
  );
  return saved;
});
