import { NodeFileSystem } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import { parse } from "jsonc-parser";
import { claudeEntry } from "../src/agents/claude-code.ts";
import { copilotEntry } from "../src/agents/github-copilot.ts";
import { resolveMcp } from "../src/mcp-inputs.ts";
import { SCHEMA_URL } from "../src/skillset-file.ts";
import { runCli } from "./harness.ts";
import { docs, events, github } from "./mcp-fixtures.ts";

const info = (id: string, universal: boolean) => ({
  id,
  name: id,
  projectSkillsDir: `.${id}/skills`,
  globalSkillsDir: null,
  universal,
});

const stdio = {
  command: "npx",
  args: ["-y", "@scope/server-github@1.2.3", "--token", "${GITHUB_TOKEN}"],
  env: { LOG_LEVEL: "info" },
};
const remote = {
  docs: { url: "https://mcp.example.com/mcp", headers: { Authorization: "Bearer ${DOCS_KEY}" } },
  events: { url: "https://mcp.example.com/sse" },
};

// Copilot CLI's project files take Claude Code's shape; its global file also wants a type and a tools list.
it.each([
  ["project", github, { type: "stdio", ...stdio }],
  ["project", docs, { type: "http", ...remote.docs }],
  ["project", events, { type: "sse", ...remote.events }],
  ["global", github, { type: "local", ...stdio, tools: ["*"] }],
  ["global", docs, { type: "http", ...remote.docs, tools: ["*"] }],
  ["global", events, { type: "sse", ...remote.events, tools: ["*"] }],
] as const)("github-copilot maps %s %s.name", (scope, entry, expected) => {
  assert.deepStrictEqual(copilotEntry(resolveMcp(entry), scope), expected);
});

// The project .mcp.json is shared with Claude Code, so both must write the same entry.
it.each([github, docs, events])(
  "github-copilot and claude-code share the project entry of $name",
  (entry) => {
    assert.deepStrictEqual(
      copilotEntry(resolveMcp(entry), "project"),
      claudeEntry(resolveMcp(entry)),
    );
  },
);

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
  const run = (argv: ReadonlyArray<string>, env: Record<string, string> = {}) =>
    runCli(["install", ...argv, "--set", file], {
      cwd,
      home,
      env: { SKILLSET_HOME: dir, ...env },
      upstream: {
        supportedAgents: [
          info("universal", true),
          info("claude-code", false),
          info("github-copilot", true),
        ],
      },
    });
  return { fs, dir, cwd, home, run };
});

it.effect("-a github-copilot writes the project .mcp.json and keeps the rest of the file", () =>
  Effect.gen(function* () {
    const { fs, cwd, run } = yield* setup;
    yield* fs.makeDirectory(cwd, { recursive: true });
    yield* fs.writeFileString(
      `${cwd}/.mcp.json`,
      '{\n  // team servers\n  "mcpServers": {\n    "mine": { "command": "x" }\n  }\n}\n',
    );
    const result = yield* run(["-y", "-a", "github-copilot"]);
    assert.strictEqual(result.code, 0);
    const text = yield* fs.readFileString(`${cwd}/.mcp.json`);
    assert.include(text, "// team servers");
    assert.deepStrictEqual(parse(text).mcpServers, {
      mine: { command: "x" },
      github: { type: "stdio", ...stdio },
      docs: { type: "http", ...remote.docs },
      events: { type: "sse", ...remote.events },
    });
    assert.include(
      result.out.join("\n"),
      `Installed MCP servers github, docs, events for github-copilot in ${cwd}/.mcp.json`,
    );
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("-g writes ~/.copilot/mcp-config.json, or $COPILOT_HOME/mcp-config.json when set", () =>
  Effect.gen(function* () {
    const { fs, dir, home, run } = yield* setup;
    const expected = {
      github: { type: "local", ...stdio, tools: ["*"] },
      docs: { type: "http", ...remote.docs, tools: ["*"] },
      events: { type: "sse", ...remote.events, tools: ["*"] },
    };
    const first = yield* run(["-y", "-g", "-a", "github-copilot"]);
    assert.strictEqual(first.code, 0);
    assert.deepStrictEqual(
      parse(yield* fs.readFileString(`${home}/.copilot/mcp-config.json`)).mcpServers,
      expected,
    );
    const custom = `${dir}/copilot-home`;
    const second = yield* run(["-y", "-g", "-a", "github-copilot"], { COPILOT_HOME: custom });
    assert.strictEqual(second.code, 0);
    assert.deepStrictEqual(
      parse(yield* fs.readFileString(`${custom}/mcp-config.json`)).mcpServers,
      expected,
    );
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("claude-code and github-copilot together write the shared .mcp.json once", () =>
  Effect.gen(function* () {
    const { fs, cwd, run } = yield* setup;
    const result = yield* run(["-y", "-a", "claude-code", "github-copilot"]);
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(parse(yield* fs.readFileString(`${cwd}/.mcp.json`)).mcpServers, {
      github: { type: "stdio", ...stdio },
      docs: { type: "http", ...remote.docs },
      events: { type: "sse", ...remote.events },
    });
    const installed = result.out.filter((line) => String(line).startsWith("Installed MCP servers"));
    assert.deepStrictEqual(installed, [
      `Installed MCP servers github, docs, events for claude-code, github-copilot in ${cwd}/.mcp.json`,
    ]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("claude-code and github-copilot keep separate global files", () =>
  Effect.gen(function* () {
    const { fs, home, run } = yield* setup;
    const result = yield* run(["-y", "-g", "-a", "claude-code", "github-copilot"]);
    assert.strictEqual(result.code, 0);
    assert.isTrue(yield* fs.exists(`${home}/.claude.json`));
    assert.isTrue(yield* fs.exists(`${home}/.copilot/mcp-config.json`));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);
