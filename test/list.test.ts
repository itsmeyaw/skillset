import { NodeFileSystem } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runCli } from "./harness.ts";

it.effect("list prints Skill Entries sorted by name with Source and short Pin", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/custom.json`;
    yield* fs.writeFileString(
      file,
      JSON.stringify({
        $schema:
          "https://raw.githubusercontent.com/itsmeyaw/skillset/main/schemas/skillset/v1.json",
        skills: [
          { name: "zeta", source: "owner/z#dev", commit: "b".repeat(40) },
          { name: "alpha", source: "owner/a", commit: "a".repeat(40) },
        ],
      }),
    );
    const result = yield* runCli(["list", "--set", file]);
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(result.out, ["alpha  owner/a  aaaaaaa", "zeta  owner/z#dev  bbbbbbb"]);
    assert.deepStrictEqual(result.err, []);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("list reports an empty Skillset at the default path", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    yield* fs.writeFileString(
      `${dir}/skillset.json`,
      JSON.stringify({
        $schema:
          "https://raw.githubusercontent.com/itsmeyaw/skillset/main/schemas/skillset/v1.json",
        skills: [],
      }),
    );
    const output = execFileSync(
      process.execPath,
      [fileURLToPath(new URL("../src/bin.ts", import.meta.url)), "list"],
      {
        cwd: dir,
        env: { ...process.env, SKILLSET_HOME: dir },
        encoding: "utf8",
      },
    );
    assert.match(output, /empty/i);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

const validSkillEntry = { name: "one", source: "owner/repo", commit: "a".repeat(40) };
const schemaUrl =
  "https://raw.githubusercontent.com/itsmeyaw/skillset/main/schemas/skillset/v1.json";

for (const [description, contents, message] of [
  ["unknown schema", { $schema: "https://example.com/v2", skills: [] }, /\$schema/],
  [
    "duplicate names",
    { $schema: schemaUrl, skills: [validSkillEntry, { ...validSkillEntry, source: "other/repo" }] },
    /duplicate skill name/i,
  ],
  [
    "short Pin",
    { $schema: schemaUrl, skills: [{ ...validSkillEntry, commit: "abcdef" }] },
    /40-character lowercase/i,
  ],
  [
    "uppercase Pin",
    { $schema: schemaUrl, skills: [{ ...validSkillEntry, commit: "A".repeat(40) }] },
    /40-character lowercase/i,
  ],
  [
    "Pin with a trailing newline",
    { $schema: schemaUrl, skills: [{ ...validSkillEntry, commit: "a".repeat(40) + "\n" }] },
    /40-character lowercase/i,
  ],
  [
    "extra fields",
    { $schema: schemaUrl, skills: [{ ...validSkillEntry, extra: true }] },
    /excess property/i,
  ],
] as const) {
  it.effect(`list rejects ${description}`, () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const file = `${dir}/set.json`;
      yield* fs.writeFileString(file, JSON.stringify(contents));
      const result = yield* runCli(["--set", file, "list"]);
      assert.strictEqual(result.code, 1);
      assert.match(result.err.join("\n"), message);
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  );
}

it.effect("list rejects a missing Skillset file", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const result = yield* runCli(["list", "--set", `${dir}/missing.json`]);
    assert.strictEqual(result.code, 1);
    assert.include(
      result.err.join("\n"),
      `Cannot find Skillset "${dir}/missing.json" in ${dir}/missing.json`,
    );
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);
