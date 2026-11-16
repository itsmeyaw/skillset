import { NodeFileSystem } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import { readSkillset, SCHEMA_URL } from "../src/skillset-file.ts";

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

it.effect("readSkillset accepts ordinary Unicode Entry names and Sources", () =>
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
