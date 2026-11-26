import { Effect, FileSystem, JsonSchema, Schema } from "effect";
import { writeFileAtomic } from "./atomic-write.ts";
import { SkillsetFileError } from "./errors.ts";
import { entryText } from "./entry-text.ts";
import { McpEntry } from "./mcp-entry.ts";
import { PIN_PATTERN } from "./pin.ts";

// Spec #1, Skillset file format: the schema URL is also the format version.
export const SCHEMA_URL =
  "https://raw.githubusercontent.com/itsmeyaw/skillset/main/schemas/skillset/v1.json";

export const SkillEntry = Schema.Struct({
  name: entryText,
  source: entryText,
  commit: Schema.String.check(
    Schema.isPattern(PIN_PATTERN, {
      message: "Expected a full 40-character lowercase commit SHA",
    }),
  ),
});

const uniqueNames = (kind: "skill" | "MCP") =>
  Schema.makeFilter((entries: ReadonlyArray<{ readonly name: string }>) => {
    const names = new Set<string>();
    for (const [index, entry] of entries.entries()) {
      if (names.has(entry.name))
        return { path: [index, "name"], issue: `Duplicate ${kind} name "${entry.name}"` };
      names.add(entry.name);
    }
    return undefined;
  });

// Spec #1, Skillset file format: names are unique and Pins are full lowercase SHAs.
export const Skillset = Schema.Struct({
  $schema: Schema.Literal(SCHEMA_URL),
  skills: Schema.Array(SkillEntry).check(uniqueNames("skill")),
  mcp: Schema.Array(McpEntry)
    .check(uniqueNames("MCP"))
    .pipe(Schema.withDecodingDefaultKey(Effect.succeed([]))),
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
export const sortedByName = <T extends { readonly name: string }>(entries: ReadonlyArray<T>) =>
  [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

// Spec #1, Skillset file format: write sorted Skill Entries with two-space indentation and a newline.
export const writeSkillset = Effect.fn("writeSkillset")(function* (
  path: string,
  skillset: Skillset,
) {
  const validated = yield* Schema.decodeEffect(Skillset)(skillset, {
    onExcessProperty: "error",
  }).pipe(Effect.mapError(invalidSkillset(path)));
  // ADR 0006: a Skillset without MCP Entries is written exactly as before.
  const saved = {
    $schema: validated.$schema,
    skills: sortedByName(validated.skills),
    mcp: sortedByName(validated.mcp),
  };
  const { mcp, ...withoutMcp } = saved;
  const content = JSON.stringify(mcp.length ? saved : withoutMcp, null, 2) + "\n";
  yield* writeFileAtomic(path, content).pipe(
    Effect.mapError(
      (error) =>
        new SkillsetFileError({
          message: `Cannot write Skillset file ${path}: ${error.message}`,
        }),
    ),
  );
  return saved;
});
