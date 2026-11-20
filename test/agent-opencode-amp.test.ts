import { NodeFileSystem } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import { parse } from "jsonc-parser";
import { ampEntry } from "../src/agents/amp.ts";
import { opencodeEntry, opencodeKeyPath } from "../src/agents/opencode.ts";
import type { McpEntry } from "../src/mcp-entry.ts";
import { resolveMcp } from "../src/mcp-inputs.ts";
import { SCHEMA_URL } from "../src/skillset-file.ts";
import { runCli } from "./harness.ts";
import { docs, events, github } from "./mcp-fixtures.ts";

const info = (id: string) => ({
  id,
  name: id,
  projectSkillsDir: `.${id}/skills`,
  globalSkillsDir: null,
  universal: true,
});

it.each<[McpEntry, unknown, unknown]>([
  [
    github,
    {
      type: "local",
      command: ["npx", "-y", "@scope/server-github@1.2.3", "--token", "{env:GITHUB_TOKEN}"],
      environment: { LOG_LEVEL: "info" },
    },
    {
      command: "npx",
      args: ["-y", "@scope/server-github@1.2.3", "--token", "${GITHUB_TOKEN}"],
      env: { LOG_LEVEL: "info" },
    },
  ],
  [
    docs,
    {
      type: "remote",
      url: "https://mcp.example.com/mcp",
      headers: { Authorization: "Bearer {env:DOCS_KEY}" },
    },
    {
      url: "https://mcp.example.com/mcp",
      headers: { Authorization: "Bearer ${DOCS_KEY}" },
    },
  ],
  [
    events,
    { type: "remote", url: "https://mcp.example.com/sse" },
    { url: "https://mcp.example.com/sse" },
  ],
])("opencode and amp map entry %#", (entry, opencode, amp) => {
  assert.deepStrictEqual(opencodeEntry(resolveMcp(entry)), opencode);
  assert.deepStrictEqual(ampEntry(resolveMcp(entry)), amp);
});

it.each([
  [{}, ["mcp", "servers"]],
  [{ mcp: {} }, ["mcp", "servers"]],
  [{ mcp: { servers: {} } }, ["mcp", "servers"]],
  [{ mcp: { timeout: { startup: 1 } } }, ["mcp", "servers"]],
  [{ mcp: { a: { type: "local", command: ["x"] } } }, ["mcp"]],
  [{ mcp: { a: { type: "remote", url: "https://x.example" } } }, ["mcp"]],
] as const)("opencode keeps the shape of %j", (root, expected) => {
  assert.deepStrictEqual(opencodeKeyPath(root), expected);
});

const setup = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const dir = yield* fs.makeTempDirectoryScoped();
  const file = `${dir}/skillset.json`;
  yield* fs.writeFileString(
    file,
    JSON.stringify({ $schema: SCHEMA_URL, skills: [], mcp: [github, docs, events] }),
  );
  const cwd = `${dir}/project`;
  const home = `${dir}/home`;
  const run = (argv: ReadonlyArray<string>) =>
    runCli(["install", "-y", ...argv, "--set", file], {
      cwd,
      home,
      upstream: { supportedAgents: [info("universal"), info("opencode"), info("amp")] },
    });
  const seed = (path: string, text: string) =>
    Effect.gen(function* () {
      yield* fs.makeDirectory(path.slice(0, path.lastIndexOf("/")), { recursive: true });
      yield* fs.writeFileString(path, text);
    });
  return { fs, cwd, home, run, seed };
});

const opencodeEntries = Object.fromEntries(
  [github, docs, events].map((entry) => [entry.name, opencodeEntry(resolveMcp(entry))]),
);
const ampEntries = Object.fromEntries(
  [github, docs, events].map((entry) => [entry.name, ampEntry(resolveMcp(entry))]),
);

it.effect.each([
  { scope: "project", flags: [], dir: (cwd: string) => cwd },
  { scope: "global", flags: ["-g"], dir: (_: string, home: string) => `${home}/.config/opencode` },
])("opencode writes new $scope files in the V2 shape", ({ flags, dir }) =>
  Effect.gen(function* () {
    const { fs, cwd, home, run } = yield* setup;
    const result = yield* run(["-a", "opencode", ...flags]);
    assert.strictEqual(result.code, 0);
    const file = `${dir(cwd, home)}/opencode.json`;
    assert.deepStrictEqual(parse(yield* fs.readFileString(file)), {
      mcp: { servers: opencodeEntries },
    });
    assert.include(
      result.out.join("\n"),
      `Installed MCP servers github, docs, events for opencode in ${file}`,
    );
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("opencode keeps the V1 shape, comments and trailing commas of an existing file", () =>
  Effect.gen(function* () {
    const { fs, cwd, run, seed } = yield* setup;
    const file = `${cwd}/opencode.json`;
    yield* seed(
      file,
      '{\n  // my config\n  "theme": "dark",\n  "mcp": {\n    "mine": { "type": "local", "command": ["x"], },\n  },\n}\n',
    );
    const result = yield* run(["-a", "opencode"]);
    assert.strictEqual(result.code, 0);
    const text = yield* fs.readFileString(file);
    assert.include(text, "// my config");
    assert.match(text, /\},\s*\},\s*\}\s*$/u);
    assert.deepStrictEqual(parse(text), {
      theme: "dark",
      mcp: { mine: { type: "local", command: ["x"] }, ...opencodeEntries },
    });
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("opencode writes into an existing opencode.jsonc and creates no .json", () =>
  Effect.gen(function* () {
    const { fs, cwd, run, seed } = yield* setup;
    yield* seed(`${cwd}/opencode.jsonc`, '{\n  // mine\n  "mcp": { "servers": {}, },\n}\n');
    const result = yield* run(["-a", "opencode"]);
    assert.strictEqual(result.code, 0);
    const text = yield* fs.readFileString(`${cwd}/opencode.jsonc`);
    assert.include(text, "// mine");
    assert.deepStrictEqual(parse(text), { mcp: { servers: opencodeEntries } });
    assert.isFalse(yield* fs.exists(`${cwd}/opencode.json`));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect.each([
  { scope: "project", flags: [], dir: (cwd: string) => `${cwd}/.amp` },
  { scope: "global", flags: ["-g"], dir: (_: string, home: string) => `${home}/.config/amp` },
])("amp writes new $scope files under the flat amp.mcpServers key", ({ flags, dir }) =>
  Effect.gen(function* () {
    const { fs, cwd, home, run } = yield* setup;
    const result = yield* run(["-a", "amp", ...flags]);
    assert.strictEqual(result.code, 0);
    const file = `${dir(cwd, home)}/settings.json`;
    assert.deepStrictEqual(parse(yield* fs.readFileString(file)), {
      "amp.mcpServers": ampEntries,
    });
    assert.include(
      result.out.join("\n"),
      `Installed MCP servers github, docs, events for amp in ${file}`,
    );
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect.each(["settings.json", "settings.jsonc"])(
  "amp keeps comments, trailing commas and other settings in an existing %s",
  (name) =>
    Effect.gen(function* () {
      const { fs, cwd, run, seed } = yield* setup;
      const file = `${cwd}/.amp/${name}`;
      yield* seed(
        file,
        '{\n  // my settings\n  "amp.showCosts": false,\n  "amp.mcpServers": {\n    "mine": { "command": "x", },\n  },\n}\n',
      );
      const result = yield* run(["-a", "amp"]);
      assert.strictEqual(result.code, 0);
      const text = yield* fs.readFileString(file);
      assert.include(text, "// my settings");
      assert.match(text, /"command": "x",\s*\}/u);
      assert.deepStrictEqual(parse(text), {
        "amp.showCosts": false,
        "amp.mcpServers": { mine: { command: "x" }, ...ampEntries },
      });
      assert.isFalse(
        yield* fs.exists(
          `${cwd}/.amp/${name === "settings.json" ? "settings.jsonc" : "settings.json"}`,
        ),
      );
    }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("amp warns that workspace servers need approval", () =>
  Effect.gen(function* () {
    const { run } = yield* setup;
    const result = yield* run(["-a", "amp"]);
    assert.include(result.out.concat(result.err).join("\n"), "amp mcp approve");
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);
