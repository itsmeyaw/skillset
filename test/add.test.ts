import { NodeFileSystem } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import { runCli } from "./harness.ts";

const commit = "a".repeat(40);
const upstream = {
  commits: { [JSON.stringify(["owner/repo", null])]: commit },
  skills: { [JSON.stringify(["owner/repo", commit])]: ["zeta", "alpha"] },
};

it.effect("add without a selection lists skills without creating a Skillset file", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const result = yield* runCli(["add", "owner/repo", "--set", file], { upstream });
    assert.strictEqual(result.code, 0);
    assert.match(result.out.join("\n"), /alpha/);
    assert.match(result.out.join("\n"), /zeta/);
    assert.match(result.out.join("\n"), /-s.*--all/);
    assert.isFalse(yield* fs.exists(file));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("add writes selected skills in canonical order to a new Skillset file", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const result = yield* runCli(["add", "owner/repo", "-s", "zeta", "alpha", "--set", file], {
      upstream,
    });
    assert.strictEqual(result.code, 0);
    assert.strictEqual(
      yield* fs.readFileString(file),
      `{
  "$schema": "https://raw.githubusercontent.com/itsmeyaw/skillset/main/schemas/skillset/v1.json",
  "skills": [
    {
      "name": "alpha",
      "source": "owner/repo",
      "commit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    },
    {
      "name": "zeta",
      "source": "owner/repo",
      "commit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  ]
}\n`,
    );
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("add rejects missing skills without changing an existing Skillset", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const original = `{"$schema":"https://raw.githubusercontent.com/itsmeyaw/skillset/main/schemas/skillset/v1.json","skills":[]}\n`;
    yield* fs.writeFileString(file, original);
    const result = yield* runCli(["add", "owner/repo", "-s", "alpha", "missing", "--set", file], {
      upstream,
    });
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /missing/i);
    assert.strictEqual(yield* fs.readFileString(file), original);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("re-adding a skill from the same Source moves its Pin", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    yield* fs.writeFileString(
      file,
      JSON.stringify({
        $schema:
          "https://raw.githubusercontent.com/itsmeyaw/skillset/main/schemas/skillset/v1.json",
        skills: [{ name: "alpha", source: "owner/repo", commit: "b".repeat(40) }],
      }),
    );
    const result = yield* runCli(["add", "owner/repo", "-s", "alpha", "--set", file], { upstream });
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(JSON.parse(yield* fs.readFileString(file)).skills, [
      { name: "alpha", source: "owner/repo", commit },
    ]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("add refuses a name from a different Source without changing the file", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const original = JSON.stringify({
      $schema: "https://raw.githubusercontent.com/itsmeyaw/skillset/main/schemas/skillset/v1.json",
      skills: [{ name: "alpha", source: "other/repo", commit: "b".repeat(40) }],
    });
    yield* fs.writeFileString(file, original);
    const result = yield* runCli(["add", "owner/repo", "-s", "zeta", "alpha", "--set", file], {
      upstream,
    });
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /alpha.*other\/repo/i);
    assert.strictEqual(yield* fs.readFileString(file), original);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("add --all writes every available skill", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const result = yield* runCli(["add", "owner/repo", "--all", "--set", file], { upstream });
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(JSON.parse(yield* fs.readFileString(file)).skills, [
      { name: "alpha", source: "owner/repo", commit },
      { name: "zeta", source: "owner/repo", commit },
    ]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("add -l lists skills even with --all and leaves the file unchanged", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const original = "do not rewrite";
    yield* fs.writeFileString(file, original);
    const result = yield* runCli(["add", "owner/repo", "-l", "--all", "--set", file], { upstream });
    assert.strictEqual(result.code, 0);
    assert.match(result.out.join("\n"), /alpha/);
    assert.match(result.out.join("\n"), /-s.*--all/);
    assert.strictEqual(yield* fs.readFileString(file), original);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("add resolves a branch and preserves its Source with repeated skill flags", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const result = yield* runCli(
      ["add", "owner/repo#feature/docs", "-s", "zeta", "-s", "alpha", "--set", file],
      {
        upstream: {
          commits: { [JSON.stringify(["owner/repo", "feature/docs"])]: commit },
          skills: { [JSON.stringify(["owner/repo", commit])]: ["alpha", "zeta"] },
        },
      },
    );
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(JSON.parse(yield* fs.readFileString(file)).skills, [
      { name: "alpha", source: "owner/repo#feature/docs", commit },
      { name: "zeta", source: "owner/repo#feature/docs", commit },
    ]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("add accepts --skill and --set before the command", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const result = yield* runCli(["--set", file, "add", "owner/repo", "--skill", "alpha", "zeta"], {
      upstream,
    });
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(JSON.parse(yield* fs.readFileString(file)).skills, [
      { name: "alpha", source: "owner/repo", commit },
      { name: "zeta", source: "owner/repo", commit },
    ]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("add leaves the file absent when Source lookup fails", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const result = yield* runCli(["add", "owner/repo", "--all", "--set", file]);
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /Fake commit not configured/);
    assert.isFalse(yield* fs.exists(file));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("add rejects an empty -s flag", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const result = yield* runCli(["add", "owner/repo", "-s", "--set", file], { upstream });
    assert.strictEqual(result.code, 1);
    assert.isFalse(yield* fs.exists(file));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("add rejects an invalid Skillset file without overwriting it", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const original = '{"$schema":"https://example.com/v2","skills":[]}';
    yield* fs.writeFileString(file, original);
    const result = yield* runCli(["add", "owner/repo", "-s", "alpha", "--set", file], { upstream });
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /invalid Skillset file/i);
    assert.strictEqual(yield* fs.readFileString(file), original);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

for (const source of [
  "owner/repo@v1.2.3",
  "https://github.com/owner/repo",
  "../repo",
  "owner/repo#",
  "owner/repo\n",
]) {
  it.effect(`add rejects unsupported Source ${source} without creating a file`, () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const file = `${dir}/skillset.json`;
      const result = yield* runCli(["add", source, "--all", "--set", file], { upstream });
      assert.strictEqual(result.code, 1);
      assert.match(result.err.join("\n"), /not supported yet/i);
      assert.isFalse(yield* fs.exists(file));
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  );
}
