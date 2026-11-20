import { NodeFileSystem } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, Exit, FileSystem } from "effect";
import { parseSkillset, readSkillset, SCHEMA_URL, writeSkillset } from "../src/skillset-file.ts";

for (const field of ["name", "source"] as const) {
  for (const [description, value] of [
    ["ESC", "skill\u001b[31m"],
    ["BEL", "skill\u0007"],
    ["C1", "skill\u009b31m"],
    ["newline", "skill\n"],
    ["empty text", ""],
  ] as const) {
    it.effect(`readSkillset rejects ${field} containing ${description}`, () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fs.makeTempDirectoryScoped();
        const path = `${dir}/skillset.json`;
        yield* fs.writeFileString(
          path,
          JSON.stringify({
            $schema: SCHEMA_URL,
            skills: [
              { name: "skill", source: "owner/repo", commit: "a".repeat(40), [field]: value },
            ],
          }),
        );
        const error = yield* readSkillset(path).pipe(Effect.flip);
        assert.match(error.message, /Invalid Skillset file/);
        assert.notInclude(error.message, "\u001b");
        assert.notInclude(error.message, "\u0007");
        assert.notInclude(error.message, "\u009b");
      }).pipe(Effect.provide(NodeFileSystem.layer)),
    );
  }
}

it.effect("readSkillset accepts ordinary Unicode Skill Entry names and Sources", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const path = `${dir}/skillset.json`;
    const entry = { name: "café-🦊", source: "owner/repo#main", commit: "a".repeat(40) };
    yield* fs.writeFileString(path, JSON.stringify({ $schema: SCHEMA_URL, skills: [entry] }));
    const result = yield* readSkillset(path);
    assert.deepStrictEqual(result.skills, [entry]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("failed Skillset write preserves the original file", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const path = `${dir}/skillset.json`;
    const original = "original Skillset content";
    yield* fs.writeFileString(path, original);

    const result = yield* writeSkillset(path, { $schema: SCHEMA_URL, skills: [] }).pipe(
      Effect.provideService(FileSystem.FileSystem, {
        ...fs,
        writeFileString: (target) =>
          fs
            .writeFileString(target, "partial")
            .pipe(Effect.andThen(fs.writeFileString(`${dir}/missing/failure`, ""))),
      }),
      Effect.exit,
    );

    assert.isTrue(Exit.isFailure(result));
    assert.include(JSON.stringify(result), `Cannot write Skillset file ${path}:`);
    assert.strictEqual(yield* fs.readFileString(path), original);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("successful Skillset write replaces the file without leaving a temporary file", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const path = `${dir}/nested/skillset.json`;
    const skillset = { $schema: SCHEMA_URL, skills: [] } as const;

    yield* writeSkillset(path, skillset);
    assert.deepStrictEqual(JSON.parse(yield* fs.readFileString(path)), skillset);
    assert.isFalse(yield* fs.exists(`${path}.tmp`));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("successful Skillset write preserves existing file permissions", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const path = `${dir}/skillset.json`;
    yield* fs.writeFileString(path, "original");
    yield* fs.chmod(path, 0o600);

    yield* writeSkillset(path, { $schema: SCHEMA_URL, skills: [] });
    assert.strictEqual((yield* fs.stat(path)).mode & 0o777, 0o600);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("Skillset write does not follow a temporary-file symlink", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const path = `${dir}/skillset.json`;
    const victim = `${dir}/other-file`;
    yield* fs.writeFileString(path, "original");
    yield* fs.writeFileString(victim, "untouched");
    yield* fs.symlink(victim, `${path}.tmp`);

    const result = yield* writeSkillset(path, { $schema: SCHEMA_URL, skills: [] }).pipe(
      Effect.exit,
    );
    assert.isTrue(Exit.isFailure(result));
    assert.strictEqual(yield* fs.readFileString(path), "original");
    assert.strictEqual(yield* fs.readFileString(victim), "untouched");
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("Skillset write updates a symlink target and keeps the link", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const real = `${dir}/real.json`;
    const path = `${dir}/skillset.json`;
    yield* fs.writeFileString(real, "{}");
    yield* fs.symlink(real, path);

    yield* writeSkillset(path, { $schema: SCHEMA_URL, skills: [] });
    assert.strictEqual(yield* fs.readLink(path), real);
    assert.deepStrictEqual((yield* readSkillset(real)).skills, []);
    assert.include(yield* fs.readFileString(real), SCHEMA_URL);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("failed Skillset rename preserves the original file", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const path = `${dir}/skillset.json`;
    const original = "original Skillset content";
    yield* fs.writeFileString(path, original);

    const result = yield* writeSkillset(path, { $schema: SCHEMA_URL, skills: [] }).pipe(
      Effect.provideService(FileSystem.FileSystem, {
        ...fs,
        rename: () => fs.rename(`${dir}/missing`, path),
      }),
      Effect.exit,
    );

    assert.isTrue(Exit.isFailure(result));
    assert.include(JSON.stringify(result), `Cannot write Skillset file ${path}:`);
    assert.strictEqual(yield* fs.readFileString(path), original);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("parseSkillset rejects a duplicate Skill Entry name", () =>
  Effect.gen(function* () {
    const entry = { name: "skill", source: "owner/repo", commit: "a".repeat(40) };
    const error = yield* parseSkillset(
      JSON.stringify({ $schema: SCHEMA_URL, skills: [entry, entry] }),
      "skillset.json",
    ).pipe(Effect.flip);
    assert.match(error.message, /Duplicate skill name "skill"/);
  }),
);
