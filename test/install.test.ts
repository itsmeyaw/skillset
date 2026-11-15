import { NodeFileSystem } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import { SCHEMA_URL } from "../src/skillset-file.ts";
import { runCli } from "./harness.ts";

const commit = "a".repeat(40);

it.effect("install -y installs only selected Entries at their Pins with requested options", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    yield* fs.writeFileString(
      file,
      JSON.stringify({
        $schema: SCHEMA_URL,
        skills: [
          { name: "alpha", source: "owner/repo#branch", commit },
          { name: "beta", source: "other/repo", commit: "b".repeat(40) },
        ],
      }),
    );
    const result = yield* runCli(
      [
        "install",
        "-y",
        "-s",
        "alpha",
        "-a",
        "claude-code",
        "cursor",
        "-g",
        "--copy",
        "--set",
        file,
      ],
      {
        upstream: {
          skills: { [JSON.stringify(["owner/repo#branch", commit])]: ["alpha", "unlisted"] },
          installDir: dir,
        },
      },
    );
    assert.strictEqual(result.code, 0);
    assert.strictEqual(
      yield* fs.readFileString(`${dir}/global/claude-code/alpha`),
      `${commit}:copy`,
    );
    assert.strictEqual(yield* fs.readFileString(`${dir}/global/cursor/alpha`), `${commit}:copy`);
    assert.isFalse(yield* fs.exists(`${dir}/global/claude-code/unlisted`));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("install -y rejects an Entry missing at its Pin before writing", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const original = JSON.stringify({
      $schema: SCHEMA_URL,
      skills: [{ name: "missing", source: "owner/repo", commit }],
    });
    yield* fs.writeFileString(file, original);
    const result = yield* runCli(["install", "-y", "--set", file], {
      upstream: { skills: { [JSON.stringify(["owner/repo", commit])]: ["alpha"] } },
    });
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /missing/i);
    assert.strictEqual(yield* fs.readFileString(file), original);
    assert.deepStrictEqual(yield* fs.readDirectory(dir), ["skillset.json"]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("install stops after an upstream install reports a failed target", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    yield* fs.writeFileString(
      file,
      JSON.stringify({
        $schema: SCHEMA_URL,
        skills: [
          { name: "alpha", source: "first/repo", commit },
          { name: "beta", source: "second/repo", commit },
          { name: "gamma", source: "third/repo", commit },
        ],
      }),
    );
    const result = yield* runCli(["install", "-y", "--set", file], {
      upstream: {
        skills: {
          [JSON.stringify(["first/repo", commit])]: ["alpha"],
          [JSON.stringify(["second/repo", commit])]: ["beta"],
          [JSON.stringify(["third/repo", commit])]: ["gamma"],
        },
        failedResults: ["second/repo"],
        installDir: dir,
        disposalLog: `${dir}/disposed`,
      },
    });
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /failed.*second\/repo/i);
    assert.isTrue(yield* fs.exists(`${dir}/project/default/alpha`));
    assert.isFalse(yield* fs.exists(`${dir}/project/default/gamma`));
    assert.deepStrictEqual(
      (yield* fs.readFileString(`${dir}/disposed`)).trim().split("\n").sort(),
      [`first/repo ${commit}`, `second/repo ${commit}`, `third/repo ${commit}`],
    );
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("install -y uses default targets and leaves unrelated skills untouched", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const log = `${dir}/disposed`;
    const second = "b".repeat(40);
    yield* fs.makeDirectory(`${dir}/project/default`, { recursive: true });
    yield* fs.writeFileString(`${dir}/project/default/custom`, "mine");
    yield* fs.writeFileString(
      file,
      JSON.stringify({
        $schema: SCHEMA_URL,
        skills: [
          { name: "alpha", source: "owner/repo", commit },
          { name: "beta", source: "owner/repo", commit },
          { name: "gamma", source: "owner/repo", commit: second },
        ],
      }),
    );
    const result = yield* runCli(["install", "-y", "--set", file], {
      upstream: {
        skills: {
          [JSON.stringify(["owner/repo", commit])]: ["alpha", "beta", "outside"],
          [JSON.stringify(["owner/repo", second])]: ["gamma"],
        },
        installDir: dir,
        disposalLog: log,
      },
    });
    assert.strictEqual(result.code, 0);
    assert.strictEqual(yield* fs.readFileString(`${dir}/project/default/alpha`), `${commit}:auto`);
    assert.strictEqual(yield* fs.readFileString(`${dir}/project/default/beta`), `${commit}:auto`);
    assert.strictEqual(yield* fs.readFileString(`${dir}/project/default/gamma`), `${second}:auto`);
    assert.strictEqual(yield* fs.readFileString(`${dir}/project/default/custom`), "mine");
    assert.isFalse(yield* fs.exists(`${dir}/project/default/outside`));
    assert.deepStrictEqual((yield* fs.readFileString(log)).trim().split("\n").sort(), [
      `owner/repo ${commit}`,
      `owner/repo ${second}`,
    ]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("a failed later preflight leaves installs untouched and releases earlier sources", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const log = `${dir}/disposed`;
    yield* fs.writeFileString(
      file,
      JSON.stringify({
        $schema: SCHEMA_URL,
        skills: [
          { name: "alpha", source: "first/repo", commit },
          { name: "beta", source: "broken/repo", commit },
        ],
      }),
    );
    const result = yield* runCli(["install", "-y", "--set", file], {
      upstream: {
        skills: { [JSON.stringify(["first/repo", commit])]: ["alpha"] },
        installDir: dir,
        disposalLog: log,
      },
    });
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /broken\/repo/);
    assert.isFalse(yield* fs.exists(`${dir}/project`));
    assert.strictEqual(yield* fs.readFileString(log), `first/repo ${commit}\n`);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("install rejects invalid Pins before fetching", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    yield* fs.writeFileString(
      file,
      JSON.stringify({
        $schema: SCHEMA_URL,
        skills: [{ name: "alpha", source: "owner/repo", commit: "main" }],
      }),
    );
    const result = yield* runCli(["install", "-y", "--set", file]);
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /invalid Skillset file/i);
    assert.deepStrictEqual(yield* fs.readDirectory(dir), ["skillset.json"]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("install rejects unknown selected names before fetching", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    yield* fs.writeFileString(
      file,
      JSON.stringify({
        $schema: SCHEMA_URL,
        skills: [{ name: "alpha", source: "owner/repo", commit }],
      }),
    );
    const result = yield* runCli(["install", "-y", "-s", "missing", "--set", file]);
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /missing/i);
    assert.deepStrictEqual(yield* fs.readDirectory(dir), ["skillset.json"]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("an install error stops later Sources and releases all fetched Sources", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    yield* fs.writeFileString(
      file,
      JSON.stringify({
        $schema: SCHEMA_URL,
        skills: [
          { name: "alpha", source: "first/repo", commit },
          { name: "beta", source: "second/repo", commit },
        ],
      }),
    );
    const result = yield* runCli(["install", "--set", file], {
      upstream: {
        skills: {
          [JSON.stringify(["first/repo", commit])]: ["alpha"],
          [JSON.stringify(["second/repo", commit])]: ["beta"],
        },
        failedInstalls: ["first/repo"],
        installDir: dir,
        disposalLog: `${dir}/disposed`,
      },
    });
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /first\/repo/);
    assert.isFalse(yield* fs.exists(`${dir}/project`));
    assert.deepStrictEqual(
      (yield* fs.readFileString(`${dir}/disposed`)).trim().split("\n").sort(),
      [`first/repo ${commit}`, `second/repo ${commit}`],
    );
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("install rejects an unknown Skillset schema before fetching", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    yield* fs.writeFileString(
      file,
      JSON.stringify({ $schema: "https://example.com/v2", skills: [] }),
    );
    const result = yield* runCli(["install", "-y", "--set", file]);
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /invalid Skillset file/i);
    assert.deepStrictEqual(yield* fs.readDirectory(dir), ["skillset.json"]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);
