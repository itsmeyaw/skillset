import { NodeFileSystem, NodeServices } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem, Fiber, Option } from "effect";
import { TestClock } from "effect/testing";
import { writeFileAtomic } from "../src/atomic-write.ts";
import { installJsonMcp } from "../src/agents/json-config.ts";
import { SCHEMA_URL, type Skillset } from "../src/skillset-file.ts";
import { openSkillset } from "../src/skillset-store.ts";

const alpha = { name: "alpha", source: "owner/repo", commit: "a".repeat(40) };
const beta = { name: "beta", source: "other/repo", commit: "b".repeat(40) };

const noLeftovers = (dir: string, name: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    assert.deepStrictEqual(yield* fs.readDirectory(dir), [name]);
  });

it.effect("the second of two stores opened on one Skillset file fails and writes nothing", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const env = { SKILLSET_HOME: dir };
    const options = { set: Option.some("team"), missing: "create" } as const;
    const first = yield* openSkillset(options, env);
    const second = yield* openSkillset(options, env);
    yield* first.save({ $schema: SCHEMA_URL, skills: [alpha], mcp: [] });
    const written = yield* fs.readFileString(`${dir}/team.json`);

    const save: (
      next: Skillset,
    ) => Effect.Effect<unknown, { _tag: string; message: string }, FileSystem.FileSystem> =
      second.save;
    const result = yield* Effect.result(save({ $schema: SCHEMA_URL, skills: [beta], mcp: [] }));
    assert.strictEqual(result._tag, "Failure");
    const error = result._tag === "Failure" ? result.failure : undefined;
    assert.strictEqual(error?._tag, "SkillsetFileError");
    assert.match(
      error?.message ?? "",
      /^Cannot write Skillset file .*team\.json: it changed since it was read/,
    );
    assert.strictEqual(yield* fs.readFileString(`${dir}/team.json`), written);
    yield* noLeftovers(dir, "team.json");
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("one store can save repeatedly", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const store = yield* openSkillset(
      { set: Option.some("team"), missing: "create" },
      { SKILLSET_HOME: dir },
    );
    yield* store.save({ $schema: SCHEMA_URL, skills: [alpha], mcp: [] });
    yield* store.save({ $schema: SCHEMA_URL, skills: [alpha, beta], mcp: [] });
    assert.include(yield* fs.readFileString(`${dir}/team.json`), "beta");
    yield* noLeftovers(dir, "team.json");
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("an Agent config that changed between read and write is not overwritten", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/mcp.json`;
    yield* fs.writeFileString(file, '{"mcpServers":{"a":{"command":"old"}}}\n');
    const other = '{"mcpServers":{"a":{"command":"old"},"b":{"command":"b"}}}\n';

    const error = yield* installJsonMcp(
      file,
      ["mcpServers"],
      [{ name: "a", value: { command: "new" } }],
      () => fs.writeFileString(file, other).pipe(Effect.as(true), Effect.orDie),
    ).pipe(Effect.flip);
    assert.strictEqual(error._tag, "CliMessageError");
    assert.match(error.message, new RegExp(`^Cannot write ${file}: it changed since it was read`));
    assert.strictEqual(yield* fs.readFileString(file), other);
    yield* noLeftovers(dir, "mcp.json");
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("a stale lock is taken over", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/f.json`;
    yield* fs.writeFileString(file, "old");
    yield* fs.makeDirectory(`${file}.lock`);
    const old = new Date(Date.now() - 60_000);
    yield* fs.utimes(`${file}.lock`, old, old);

    yield* writeFileAtomic(file, "new", "old");
    assert.strictEqual(yield* fs.readFileString(file), "new");
    yield* noLeftovers(dir, "f.json");
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("a fresh foreign lock makes the write wait, then fail naming the lock", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/f.json`;
    yield* fs.writeFileString(file, "old");
    yield* fs.makeDirectory(`${file}.lock`);

    const fiber = yield* writeFileAtomic(file, "new", "old").pipe(Effect.flip, Effect.forkChild);
    while (fiber.pollUnsafe() === undefined) {
      yield* TestClock.adjust("1 second");
      yield* Effect.promise(() => new Promise((resolve) => setTimeout(resolve, 2)));
    }
    const error = yield* Fiber.join(fiber);
    assert.include(error.message, `${file}.lock`);
    assert.strictEqual(yield* fs.readFileString(file), "old");
    assert.isTrue(yield* fs.exists(`${file}.lock`));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);
