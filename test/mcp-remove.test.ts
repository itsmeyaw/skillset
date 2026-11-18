import { NodeFileSystem } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import { key, runCli } from "./harness.ts";

const schemaUrl =
  "https://raw.githubusercontent.com/itsmeyaw/skillset/main/schemas/skillset/v1.json";
const alpha = { name: "alpha", source: "owner/a", commit: "a".repeat(40) };
const server = (name: string) => ({
  name,
  launch: { type: "command", command: name, args: ["--flag"] },
});
const contents = {
  $schema: schemaUrl,
  skills: [alpha],
  mcp: [server("one"), server("three"), server("two")],
};

const setup = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const dir = yield* fs.makeTempDirectoryScoped();
  const file = `${dir}/set.json`;
  yield* fs.writeFileString(file, JSON.stringify(contents));
  yield* fs.writeFileString(`${dir}/.mcp.json`, "untouched");
  const read = fs.readFileString(file).pipe(Effect.map((text) => JSON.parse(text)));
  return { fs, dir, file, read };
});

it.effect("mcp rm removes named MCP Entries and keeps Skill Entries", () =>
  Effect.gen(function* () {
    const { fs, dir, file, read } = yield* setup;
    const result = yield* runCli(["mcp", "rm", "one", "two", "--set", file]);
    assert.strictEqual(result.code, 0);
    assert.include(result.out.join("\n"), `Removed one, two from ${file}`);
    const saved = yield* read;
    assert.deepStrictEqual(saved.mcp, [server("three")]);
    assert.deepStrictEqual(saved.skills, [alpha]);
    assert.strictEqual(yield* fs.readFileString(`${dir}/.mcp.json`), "untouched");
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("mcp rm --all removes every MCP Entry and the mcp key", () =>
  Effect.gen(function* () {
    const { file, read } = yield* setup;
    const result = yield* runCli(["mcp", "rm", "--all", "--set", file]);
    assert.strictEqual(result.code, 0);
    const saved = yield* read;
    assert.notProperty(saved, "mcp");
    assert.deepStrictEqual(saved.skills, [alpha]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("mcp rm removes known names then reports unknown ones", () =>
  Effect.gen(function* () {
    const { file, read } = yield* setup;
    const result = yield* runCli(["mcp", "rm", "one", "nope", "--set", file]);
    assert.strictEqual(result.code, 1);
    assert.include(result.err.join("\n"), "Unknown MCP servers: nope (available: one, three, two)");
    assert.deepStrictEqual(
      (yield* read).mcp.map((entry: { name: string }) => entry.name),
      ["three", "two"],
    );
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("mcp rm does not remove a Skill Entry of the same name", () =>
  Effect.gen(function* () {
    const { file, read } = yield* setup;
    yield* runCli(["mcp", "add", "alpha", "--set", file, "--", "a"]);
    yield* runCli(["mcp", "rm", "alpha", "--set", file]);
    assert.deepStrictEqual((yield* read).skills, [alpha]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("interactive mcp rm asks which MCP servers to remove", () =>
  Effect.gen(function* () {
    const { file, read } = yield* setup;
    const result = yield* runCli(["mcp", "rm", "--set", file], {
      tty: true,
      keys: [key("t", "t"), key("h", "h"), key("space"), key("enter")],
    });
    assert.strictEqual(result.code, 0);
    assert.include(result.screen.join(""), "Which MCP servers?");
    assert.include(result.out.join("\n"), `Removed three from ${file}`);
    assert.deepStrictEqual(
      (yield* read).mcp.map((entry: { name: string }) => entry.name),
      ["one", "two"],
    );
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("mcp rm without names or --all fails when unattended", () =>
  Effect.gen(function* () {
    const { file } = yield* setup;
    const result = yield* runCli(["mcp", "rm", "--set", file]);
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /Usage/);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("mcp rm rejects a Remote Skillset", () =>
  Effect.gen(function* () {
    const result = yield* runCli(["mcp", "rm", "one", "--set", "https://example.com/set.json"], {
      fetch: async () => {
        throw new Error("fetched");
      },
    });
    assert.strictEqual(result.code, 1);
    assert.include(result.err.join("\n"), "Remote Skillset");
  }),
);
