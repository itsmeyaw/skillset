import { NodeFileSystem } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import { key, runCli } from "./harness.ts";

const schemaUrl =
  "https://raw.githubusercontent.com/itsmeyaw/skillset/main/schemas/skillset/v1.json";
const alpha = { name: "alpha", source: "owner/a", commit: "a".repeat(40) };
const beta = { name: "beta", source: "owner/b#dev", commit: "b".repeat(40) };
const zeta = { name: "zeta", source: "owner/z", commit: "c".repeat(40) };

it.effect("remove -y keeps non-interactive usage behavior on a TTY", () =>
  Effect.gen(function* () {
    const result = yield* runCli(["remove", "-y"], { tty: true });
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /Usage/);
    assert.deepStrictEqual(result.screen, []);
  }),
);

it.effect("interactive remove selects Skill Entries without touching others", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/set.json`;
    yield* fs.writeFileString(file, JSON.stringify({ $schema: schemaUrl, skills: [alpha, beta] }));
    const result = yield* runCli(["remove", "--set", file], {
      tty: true,
      keys: [key("b", "b"), key("space"), key("enter")],
    });
    assert.strictEqual(result.code, 0);
    assert.include(result.out.join("\n"), `Removed beta from ${file}`);
    assert.deepStrictEqual(JSON.parse(yield* fs.readFileString(file)).skills, [alpha]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("interactive remove on an empty Skillset skips the picker", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/set.json`;
    yield* fs.writeFileString(file, JSON.stringify({ $schema: schemaUrl, skills: [] }));
    const result = yield* runCli(["remove", "--set", file], { tty: true });
    assert.strictEqual(result.code, 0);
    assert.include(result.out.join("\n"), "This Skillset is empty.");
    assert.deepStrictEqual(result.screen, []);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("cancelling interactive remove preserves the Skillset", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/set.json`;
    const original = JSON.stringify({ $schema: schemaUrl, skills: [alpha] });
    yield* fs.writeFileString(file, original);
    const result = yield* runCli(["remove", "--set", file], { tty: true, keys: [key("escape")] });
    assert.strictEqual(result.code, 130);
    assert.include(result.out.join("\n"), "Cancelled");
    assert.strictEqual(yield* fs.readFileString(file), original);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("remove deletes named Skill Entries and writes the remainder canonically", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/custom.json`;
    yield* fs.writeFileString(
      file,
      JSON.stringify({ $schema: schemaUrl, skills: [zeta, beta, alpha] }),
    );
    yield* fs.writeFileString(`${dir}/installed-skill.txt`, "untouched");

    const result = yield* runCli(["remove", "beta", "--set", file]);
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(result.err, []);
    assert.strictEqual(
      yield* fs.readFileString(file),
      JSON.stringify({ $schema: schemaUrl, skills: [alpha, zeta] }, null, 2) + "\n",
    );
    assert.strictEqual(yield* fs.readFileString(`${dir}/installed-skill.txt`), "untouched");
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("remove --all empties the Skillset", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/set.json`;
    yield* fs.writeFileString(file, JSON.stringify({ $schema: schemaUrl, skills: [zeta, alpha] }));

    const result = yield* runCli(["remove", "--all", "--set", file]);
    assert.strictEqual(result.code, 0);
    assert.strictEqual(
      yield* fs.readFileString(file),
      JSON.stringify({ $schema: schemaUrl, skills: [] }, null, 2) + "\n",
    );
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("remove without names or --all reports usage without changing the file", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/set.json`;
    const original = JSON.stringify({ $schema: schemaUrl, skills: [zeta, alpha] });
    yield* fs.writeFileString(file, original);

    const result = yield* runCli(["remove", "--set", file]);
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /usage:.*remove.*--all/i);
    assert.strictEqual(yield* fs.readFileString(file), original);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("remove reports unknown names but still removes all known names", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/set.json`;
    yield* fs.writeFileString(
      file,
      JSON.stringify({ $schema: schemaUrl, skills: [zeta, beta, alpha] }),
    );

    const result = yield* runCli(["--set", file, "remove", "zeta", "missing", "alpha", "absent"]);
    assert.strictEqual(result.code, 1);
    assert.include(result.err.join("\n"), "Unknown skills: missing, absent");
    assert.strictEqual(
      yield* fs.readFileString(file),
      JSON.stringify({ $schema: schemaUrl, skills: [beta] }, null, 2) + "\n",
    );
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("remove leaves the file unchanged when all names are unknown", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/set.json`;
    const original = JSON.stringify({ $schema: schemaUrl, skills: [zeta, alpha] });
    yield* fs.writeFileString(file, original);

    const result = yield* runCli(["remove", "missing", "--set", file]);
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /missing/);
    assert.strictEqual(yield* fs.readFileString(file), original);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("remove --all empties the file and reports unknown supplied names", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/set.json`;
    yield* fs.writeFileString(file, JSON.stringify({ $schema: schemaUrl, skills: [zeta, alpha] }));

    const result = yield* runCli(["remove", "missing", "--all", "--set", file]);
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /missing/);
    assert.strictEqual(
      yield* fs.readFileString(file),
      JSON.stringify({ $schema: schemaUrl, skills: [] }, null, 2) + "\n",
    );
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("remove rejects invalid Skillset files without changing them", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/set.json`;
    const original = JSON.stringify({ $schema: "https://example.com/v2", skills: [alpha] });
    yield* fs.writeFileString(file, original);

    const result = yield* runCli(["remove", "--all", "--set", file]);
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /invalid Skillset file/i);
    assert.strictEqual(yield* fs.readFileString(file), original);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("remove rejects missing Skillset files without creating them", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/missing.json`;

    const result = yield* runCli(["remove", "--all", "--set", file]);
    assert.strictEqual(result.code, 1);
    assert.include(result.err.join("\n"), `Cannot find Skillset "${file}" in ${file}`);
    assert.isFalse(yield* fs.exists(file));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("remove --help shows usage without reading a file", () =>
  Effect.gen(function* () {
    const result = yield* runCli(["remove", "--help"]);
    assert.strictEqual(result.code, 0);
    assert.match(result.out.join("\n"), /--all/);
    assert.match(result.out.join("\n"), /skills/);
  }),
);
