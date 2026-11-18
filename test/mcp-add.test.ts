import { NodeFileSystem } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runCli } from "./harness.ts";

const schemaUrl =
  "https://raw.githubusercontent.com/itsmeyaw/skillset/main/schemas/skillset/v1.json";
const alpha = { name: "alpha", source: "owner/a", commit: "a".repeat(40) };

const setup = (contents: unknown = { $schema: schemaUrl, skills: [] }) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/set.json`;
    yield* fs.writeFileString(file, JSON.stringify(contents));
    const read = fs.readFileString(file).pipe(Effect.map((text) => JSON.parse(text)));
    return { fs, dir, file, read };
  });

it.effect("mcp add stores a manual local server as an argument list", () =>
  Effect.gen(function* () {
    const { file, read } = yield* setup();
    const result = yield* runCli(["mcp", "add", "files", "--set", file, "--", "npx", "-y", "pkg"]);
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(result.err, []);
    assert.include(result.out.join("\n"), `Added files to ${file}`);
    assert.deepStrictEqual((yield* read).mcp, [
      { name: "files", launch: { type: "command", command: "npx", args: ["-y", "pkg"] } },
    ]);
    const listed = yield* runCli(["ls", "--set", file]);
    assert.deepStrictEqual(listed.out.slice(-2), ["MCP servers:", "files  manual  npx -y pkg"]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("mcp add stores a manual remote server with declared env and headers", () =>
  Effect.gen(function* () {
    const { file, read } = yield* setup();
    const result = yield* runCli([
      "mcp",
      "add",
      "docs",
      "--set",
      file,
      "--url",
      "https://mcp.example.com/mcp",
      "--header",
      "X-Api-Key",
      "--env",
      "DOCS_REGION",
    ]);
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual((yield* read).mcp, [
      {
        name: "docs",
        launch: {
          type: "remote",
          transport: "streamable-http",
          url: "https://mcp.example.com/mcp",
          headers: [{ name: "X-Api-Key", value: "{X-Api-Key}" }],
        },
        inputs: [
          { name: "X-Api-Key", kind: "variable", required: true, secret: true },
          { name: "DOCS_REGION", kind: "env", required: true, secret: true },
        ],
      },
    ]);
    const listed = yield* runCli(["ls", "--set", file]);
    assert.deepStrictEqual(listed.out.slice(-2), [
      "MCP servers:",
      "docs  manual  https://mcp.example.com/mcp",
    ]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("mcp add keeps MCP Entries sorted and lets a skill share the name", () =>
  Effect.gen(function* () {
    const { file, read } = yield* setup({ $schema: schemaUrl, skills: [alpha] });
    yield* runCli(["mcp", "add", "zeta", "--set", file, "--", "z"]);
    const result = yield* runCli(["mcp", "add", "alpha", "--set", file, "--", "a"]);
    assert.strictEqual(result.code, 0);
    const saved = yield* read;
    assert.deepStrictEqual(saved.skills, [alpha]);
    assert.deepStrictEqual(
      saved.mcp.map((entry: { name: string }) => entry.name),
      ["alpha", "zeta"],
    );
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("mcp add creates a missing Skillset file", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/new.json`;
    const result = yield* runCli(["mcp", "add", "files", "--set", file, "--", "files-mcp"]);
    assert.strictEqual(result.code, 0);
    const saved = JSON.parse(yield* fs.readFileString(file));
    assert.deepStrictEqual(saved.skills, []);
    assert.strictEqual(saved.mcp[0].name, "files");
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("mcp add accepts a bare User Skillset name", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const home = yield* fs.makeTempDirectoryScoped();
    const result = yield* runCli(["mcp", "add", "files", "--set", "team", "--", "files-mcp"], {
      env: { SKILLSET_HOME: home },
    });
    assert.strictEqual(result.code, 0);
    const saved = JSON.parse(yield* fs.readFileString(`${home}/team.json`));
    assert.strictEqual(saved.mcp[0].name, "files");
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("mcp add writes ./skillset.json by default", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    execFileSync(
      process.execPath,
      [
        fileURLToPath(new URL("../src/bin.ts", import.meta.url)),
        "mcp",
        "add",
        "files",
        "--",
        "files-mcp",
      ],
      { cwd: dir, env: { ...process.env, SKILLSET_HOME: dir }, encoding: "utf8" },
    );
    const saved = JSON.parse(yield* fs.readFileString(`${dir}/skillset.json`));
    assert.strictEqual(saved.mcp[0].name, "files");
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("mcp add rejects a Remote Skillset without fetching it", () =>
  Effect.gen(function* () {
    const result = yield* runCli(
      ["mcp", "add", "files", "--set", "https://example.com/set.json", "--", "files-mcp"],
      {
        fetch: async () => {
          throw new Error("fetched");
        },
      },
    );
    assert.strictEqual(result.code, 1);
    assert.include(result.err.join("\n"), "Remote Skillset");
  }),
);

it.effect.each([
  { args: ["--env", "TOKEN=abc", "--", "cmd"], message: "TOKEN=abc" },
  { args: ["--header", "X-Key=abc", "--url", "https://a.example/mcp"], message: "X-Key=abc" },
  { args: ["--url", "http://a.example/mcp"], message: "HTTPS" },
  { args: ["--url", "https://a.example/mcp", "--", "cmd"], message: "not both" },
  { args: [], message: "command after --" },
  { args: ["--header", "X-Key", "--", "cmd"], message: "--header requires --url" },
  { args: ["--env", "bad name", "--", "cmd"], message: "bad name" },
])("mcp add rejects $args", ({ args, message }) =>
  Effect.gen(function* () {
    const { file, fs } = yield* setup();
    const before = yield* fs.readFileString(file);
    const result = yield* runCli(["mcp", "add", "files", "--set", file, ...args]);
    assert.strictEqual(result.code, 1);
    assert.include(result.err.join("\n"), message);
    assert.strictEqual(yield* fs.readFileString(file), before);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("mcp add rejects a bad name", () =>
  Effect.gen(function* () {
    const { file } = yield* setup();
    const result = yield* runCli(["mcp", "add", "bad name", "--set", file, "--", "cmd"]);
    assert.strictEqual(result.code, 1);
    assert.include(result.err.join("\n"), "letters, digits");
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("mcp add rejects a duplicate MCP Entry name", () =>
  Effect.gen(function* () {
    const { file, fs } = yield* setup();
    yield* runCli(["mcp", "add", "files", "--set", file, "--", "one"]);
    const before = yield* fs.readFileString(file);
    const result = yield* runCli(["mcp", "add", "files", "--set", file, "--", "two"]);
    assert.strictEqual(result.code, 1);
    assert.include(result.err.join("\n"), "MCP server files already exists");
    assert.strictEqual(yield* fs.readFileString(file), before);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);
