import { Effect, FileSystem, JsonSchema, Schema } from "effect";
import { CliError } from "effect/cli";

// Spec #1, Skillset file format: the schema URL is also the format version.
export const SCHEMA_URL =
  "https://raw.githubusercontent.com/itsmeyaw/skillset/main/schemas/skillset/v1.json";

export const Entry = Schema.Struct({
  name: Schema.String.check(Schema.isNonEmpty()),
  source: Schema.String.check(Schema.isNonEmpty()),
  commit: Schema.String.check(
    Schema.isPattern(/^[a-f0-9]{40}$/u, {
      message: "Expected a full 40-character lowercase commit SHA",
    }),
  ),
});

// Spec #1, Skillset file format: names are unique and Pins are full lowercase SHAs.
export const Skillset = Schema.Struct({
  $schema: Schema.Literal(SCHEMA_URL),
  skills: Schema.Array(Entry).check(
    Schema.makeFilter((entries) => {
      const names = new Set<string>();
      for (const [index, entry] of entries.entries()) {
        if (names.has(entry.name))
          return { path: [index, "name"], issue: `Duplicate skill name "${entry.name}"` };
        names.add(entry.name);
      }
      return undefined;
    }),
  ),
}).annotate({
  title: "Skillset",
  description: "A curated list of agent skills pinned to commits.",
});

export type Skillset = typeof Skillset.Type;
export type Entry = typeof Entry.Type;

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

export class SkillsetFileError extends Schema.TaggedError<
  SkillsetFileError,
  { readonly brand: unique symbol }
>()("SkillsetFileError", {
  message: Schema.String,
}) {
  override get [CliError.userMessage]() {
    return this.message;
  }
}

// Spec #1, Skillset file module: reject invalid content and unknown versions before acting.
export const readSkillset = Effect.fn("readSkillset")(function* (path: string) {
  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs
    .readFileString(path)
    .pipe(
      Effect.mapError(
        (error) =>
          new SkillsetFileError({ message: `Cannot read Skillset file ${path}: ${error.message}` }),
      ),
    );
  return yield* Schema.decodeEffect(Schema.fromJsonString(Skillset))(text, {
    onExcessProperty: "error",
  }).pipe(
    Effect.mapError(
      (error) =>
        new SkillsetFileError({ message: `Invalid Skillset file ${path}: ${error.message}` }),
    ),
  );
});

// Spec #1, Skillset file format: canonical order is independent of input order.
export const sortedEntries = (entries: ReadonlyArray<Entry>): Array<Entry> =>
  [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

// Spec #1, Skillset file format: write sorted Entries with two-space indentation and a newline.
export const writeSkillset = Effect.fn("writeSkillset")(function* (
  path: string,
  skillset: Skillset,
) {
  const fs = yield* FileSystem.FileSystem;
  const validated = yield* Schema.decodeEffect(Skillset)(skillset, {
    onExcessProperty: "error",
  }).pipe(
    Effect.mapError(
      (error) =>
        new SkillsetFileError({ message: `Invalid Skillset file ${path}: ${error.message}` }),
    ),
  );
  const content =
    JSON.stringify(
      { $schema: validated.$schema, skills: sortedEntries(validated.skills) },
      null,
      2,
    ) + "\n";
  yield* fs.writeFileString(path, content).pipe(
    Effect.mapError(
      (error) =>
        new SkillsetFileError({
          message: `Cannot write Skillset file ${path}: ${error.message}`,
        }),
    ),
  );
});
