import { NodeFileSystem } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import { runCli } from "./harness.ts";

const schemaUrl =
  "https://raw.githubusercontent.com/itsmeyaw/skillset/main/schemas/skillset/v1.json";
const old = "a".repeat(40);
const latest = "b".repeat(40);

it.effect("update moves every Entry and changes only the Skillset file", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/set.json`;
    yield* fs.writeFileString(
      file,
      JSON.stringify({
        $schema: schemaUrl,
        skills: [
          { name: "zeta", source: "owner/repo", commit: old },
          { name: "alpha", source: "owner/repo", commit: old },
        ],
      }),
    );
    yield* fs.writeFileString(`${dir}/installed-skill`, "untouched");
    const result = yield* runCli(["update", "--set", file], {
      upstream: {
        commits: { [JSON.stringify(["owner/repo", null])]: latest },
        skills: { [JSON.stringify(["owner/repo", latest])]: ["alpha", "zeta"] },
      },
    });
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(result.out, ["zeta  aaaaaaa → bbbbbbb", "alpha  aaaaaaa → bbbbbbb"]);
    assert.deepStrictEqual(result.err, []);
    assert.strictEqual(
      yield* fs.readFileString(file),
      JSON.stringify(
        {
          $schema: schemaUrl,
          skills: [
            { name: "alpha", source: "owner/repo", commit: latest },
            { name: "zeta", source: "owner/repo", commit: latest },
          ],
        },
        null,
        2,
      ) + "\n",
    );
    assert.strictEqual(yield* fs.readFileString(`${dir}/installed-skill`), "untouched");
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("update resolves each distinct Source once and follows its branch", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/set.json`;
    const entries = [
      { name: "one", source: "owner/repo", commit: old },
      { name: "two", source: "owner/repo", commit: old },
      { name: "three", source: "owner/repo#dev", commit: old },
    ];
    yield* fs.writeFileString(file, JSON.stringify({ $schema: schemaUrl, skills: entries }));
    const commitLookups: Array<string> = [];
    const result = yield* runCli(["update", "--set", file], {
      upstream: {
        commitLookups,
        commits: {
          [JSON.stringify(["owner/repo", null])]: latest,
          [JSON.stringify(["owner/repo", "dev"])]: "c".repeat(40),
        },
        skills: {
          [JSON.stringify(["owner/repo", latest])]: ["one", "two"],
          [JSON.stringify(["owner/repo", "c".repeat(40)])]: ["three"],
        },
      },
    });
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(commitLookups, [
      JSON.stringify(["owner/repo", null]),
      JSON.stringify(["owner/repo", "dev"]),
    ]);
    assert.deepStrictEqual(JSON.parse(yield* fs.readFileString(file)).skills, [
      { ...entries[0], commit: latest },
      { ...entries[2], commit: "c".repeat(40) },
      { ...entries[1], commit: latest },
    ]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("update with names changes only selected Entries", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/set.json`;
    const entries = [
      { name: "alpha", source: "owner/repo", commit: old },
      { name: "beta", source: "other/repo", commit: old },
      { name: "gamma", source: "owner/repo", commit: old },
    ];
    yield* fs.writeFileString(file, JSON.stringify({ $schema: schemaUrl, skills: entries }));
    const result = yield* runCli(["--set", file, "update", "alpha", "gamma"], {
      upstream: {
        commits: { [JSON.stringify(["owner/repo", null])]: latest },
        skills: { [JSON.stringify(["owner/repo", latest])]: ["alpha", "gamma"] },
      },
    });
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(result.out, ["alpha  aaaaaaa → bbbbbbb", "gamma  aaaaaaa → bbbbbbb"]);
    assert.deepStrictEqual(JSON.parse(yield* fs.readFileString(file)).skills, [
      { ...entries[0], commit: latest },
      entries[1],
      { ...entries[2], commit: latest },
    ]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("update skips version-pinned Sources without resolving or rewriting them", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/set.json`;
    const original = JSON.stringify({
      $schema: schemaUrl,
      skills: [
        { name: "tag", source: "owner/repo@v1.2.3", commit: old },
        { name: "sha", source: `owner/repo@${latest}`, commit: old },
      ],
    });
    yield* fs.writeFileString(file, original);
    const commitLookups: Array<string> = [];
    const result = yield* runCli(["update", "--set", file], { upstream: { commitLookups } });
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(commitLookups, []);
    assert.deepStrictEqual(result.out, []);
    assert.strictEqual(yield* fs.readFileString(file), original);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("update warns for missing skills, keeps their Pins, and updates others", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/set.json`;
    const entries = [
      { name: "alpha", source: "owner/repo", commit: old },
      { name: "beta", source: "owner/repo", commit: old },
      { name: "gamma", source: "other/repo", commit: old },
      { name: "zeta", source: "other/repo", commit: old },
    ];
    yield* fs.writeFileString(file, JSON.stringify({ $schema: schemaUrl, skills: entries }));
    const result = yield* runCli(["update", "--set", file], {
      upstream: {
        commits: {
          [JSON.stringify(["owner/repo", null])]: latest,
          [JSON.stringify(["other/repo", null])]: latest,
        },
        skills: {
          [JSON.stringify(["owner/repo", latest])]: ["alpha"],
          [JSON.stringify(["other/repo", latest])]: ["gamma"],
        },
      },
    });
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /warning/i);
    assert.match(result.err.join("\n"), /beta/);
    assert.match(result.err.join("\n"), /zeta/);
    assert.deepStrictEqual(result.out, ["alpha  aaaaaaa → bbbbbbb", "gamma  aaaaaaa → bbbbbbb"]);
    assert.deepStrictEqual(JSON.parse(yield* fs.readFileString(file)).skills, [
      { ...entries[0], commit: latest },
      entries[1],
      { ...entries[2], commit: latest },
      entries[3],
    ]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("update does not report or rewrite unchanged Pins", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/set.json`;
    const original = JSON.stringify({
      $schema: schemaUrl,
      skills: [{ name: "alpha", source: "owner/repo", commit: latest }],
    });
    yield* fs.writeFileString(file, original);
    const result = yield* runCli(["update", "--set", file], {
      upstream: {
        commits: { [JSON.stringify(["owner/repo", null])]: latest },
        skills: { [JSON.stringify(["owner/repo", latest])]: ["alpha"] },
      },
    });
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(result.out, []);
    assert.strictEqual(yield* fs.readFileString(file), original);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("update retains encoded tree ref segments like skills", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/set.json`;
    const source = "https://github.com/owner/repo/tree/feature%2Fdocs";
    yield* fs.writeFileString(
      file,
      JSON.stringify({ $schema: schemaUrl, skills: [{ name: "alpha", source, commit: old }] }),
    );
    const result = yield* runCli(["update", "alpha", "--set", file], {
      upstream: {
        commits: { [JSON.stringify(["https://github.com/owner/repo", "feature%2Fdocs"])]: latest },
        skills: { [JSON.stringify(["https://github.com/owner/repo", latest])]: ["alpha"] },
      },
    });
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(JSON.parse(yield* fs.readFileString(file)).skills, [
      { name: "alpha", source, commit: latest },
    ]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("update keeps failed Source Pins and updates other Sources", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/set.json`;
    const original = JSON.stringify({
      $schema: schemaUrl,
      skills: [
        { name: "alpha", source: "broken/repo", commit: old },
        { name: "beta", source: "missing/repo", commit: old },
        { name: "gamma", source: "owner/repo", commit: old },
        { name: "zeta", source: "broken/repo", commit: old },
      ],
    });
    yield* fs.writeFileString(file, original);
    const result = yield* runCli(["update", "--set", file], {
      upstream: {
        commits: {
          [JSON.stringify(["owner/repo", null])]: latest,
          [JSON.stringify(["missing/repo", null])]: latest,
        },
        skills: { [JSON.stringify(["owner/repo", latest])]: ["gamma"] },
      },
    });
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /Fake commit not configured/);
    assert.match(result.err.join("\n"), /Fake skills not configured/);
    assert.deepStrictEqual(result.out, ["gamma  aaaaaaa → bbbbbbb"]);
    assert.deepStrictEqual(JSON.parse(yield* fs.readFileString(file)).skills, [
      { name: "alpha", source: "broken/repo", commit: old },
      { name: "beta", source: "missing/repo", commit: old },
      { name: "gamma", source: "owner/repo", commit: latest },
      { name: "zeta", source: "broken/repo", commit: old },
    ]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("update reports unknown names while updating known Entries", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/set.json`;
    yield* fs.writeFileString(
      file,
      JSON.stringify({
        $schema: schemaUrl,
        skills: [{ name: "alpha", source: "owner/repo", commit: old }],
      }),
    );
    const result = yield* runCli(["update", "alpha", "unknown", "absent", "--set", file], {
      upstream: {
        commits: { [JSON.stringify(["owner/repo", null])]: latest },
        skills: { [JSON.stringify(["owner/repo", latest])]: ["alpha"] },
      },
    });
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /unknown.*absent/i);
    assert.deepStrictEqual(JSON.parse(yield* fs.readFileString(file)).skills, [
      { name: "alpha", source: "owner/repo", commit: latest },
    ]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("update rejects invalid and missing Skillset files", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/set.json`;
    const original = JSON.stringify({ $schema: "https://example.com/v2", skills: [] });
    yield* fs.writeFileString(file, original);
    const result = yield* runCli(["update", "--set", file]);
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /invalid Skillset file/i);
    assert.strictEqual(yield* fs.readFileString(file), original);

    const missing = `${dir}/missing.json`;
    const missingResult = yield* runCli(["update", "--set", missing]);
    assert.strictEqual(missingResult.code, 1);
    assert.match(missingResult.err.join("\n"), /cannot read Skillset file/i);
    assert.isFalse(yield* fs.exists(missing));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("update --help shows usage without reading a file", () =>
  Effect.gen(function* () {
    const result = yield* runCli(["update", "--help"]);
    assert.strictEqual(result.code, 0);
    assert.match(result.out.join("\n"), /skills/i);
  }),
);
