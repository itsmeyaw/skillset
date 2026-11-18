import { NodeFileSystem } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import type { McpEntry } from "../src/mcp-entry.ts";
import { SCHEMA_URL } from "../src/skillset-file.ts";
import { key, runCli } from "./harness.ts";

const commit = "a".repeat(40);
const remote = "https://github.com/owner/repo.git";
const agent = (id: string, universal = false) => ({
  id,
  name: id,
  projectSkillsDir: `.${id}/skills`,
  globalSkillsDir: null,
  universal,
});

const github: McpEntry = {
  name: "github",
  launch: {
    type: "package",
    registryType: "npm",
    identifier: "@scope/server-github",
    version: "1.2.3",
    packageArguments: ["--token", "{token}"],
    transport: "stdio",
  },
  inputs: [
    { name: "token", kind: "variable", description: "GitHub token", secret: true },
    { name: "LOG_LEVEL", kind: "env", default: "info" },
  ],
};
const docs: McpEntry = {
  name: "docs",
  launch: {
    type: "remote",
    transport: "streamable-http",
    url: "https://mcp.example.com/mcp",
    headers: [{ name: "Authorization", value: "Bearer {key}" }],
  },
  inputs: [{ name: "key", kind: "variable", description: "Docs key", required: true }],
};

const setup = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const dir = yield* fs.makeTempDirectoryScoped();
  const file = `${dir}/skillset.json`;
  yield* fs.writeFileString(
    file,
    JSON.stringify({
      $schema: SCHEMA_URL,
      skills: [{ name: "alpha", source: "owner/repo", commit }],
      mcp: [github, docs],
    }),
  );
  const cwd = `${dir}/project`;
  const home = `${dir}/home`;
  const installCalls: Array<string> = [];
  const upstream = {
    installDir: `${dir}/skills`,
    installCalls,
    skills: { [JSON.stringify([remote, commit])]: ["alpha"] },
    supportedAgents: [agent("universal", true), agent("claude-code")],
  };
  const run = (argv: ReadonlyArray<string>, keys: ReadonlyArray<ReturnType<typeof key>>) =>
    runCli(["install", ...argv, "--set", file], { cwd, home, upstream, tty: true, keys });
  const config = `${cwd}/.mcp.json`;
  return { fs, dir, file, cwd, config, installCalls, run, upstream, home };
});

const enter = key("enter");
const space = key("space");

it.effect("asks for MCP servers after skills and prompts only non-secret inputs", () =>
  Effect.gen(function* () {
    const { fs, config, run, installCalls } = yield* setup;
    // skills, MCP servers, docs key, agents, scope, mode, confirm
    const result = yield* run(
      [],
      [enter, enter, key("abc", "abc"), enter, enter, enter, enter, enter],
    );
    assert.strictEqual(result.code, 0);
    const screen = result.screen.join("");
    const positions = [
      "Which skills?",
      "Which MCP servers?",
      "docs: Docs key",
      "Which agents?",
      "Installation scope?",
      "Installation mode?",
      "Proceed with installation?",
    ].map((prompt) => screen.indexOf(prompt));
    assert.isTrue(positions.every((position) => position >= 0));
    assert.deepStrictEqual(
      positions,
      [...positions].sort((a, b) => a - b),
    );
    assert.include(screen, "[x] docs");
    assert.include(screen, "[x] github");
    assert.notInclude(screen, "github:");
    assert.deepStrictEqual(installCalls, [remote]);
    const servers = JSON.parse(yield* fs.readFileString(config)).mcpServers;
    assert.deepStrictEqual(servers.docs.headers, { Authorization: "Bearer abc" });
    assert.deepStrictEqual(servers.github.args, [
      "@scope/server-github@1.2.3",
      "--token",
      "${GITHUB_TOKEN}",
    ]);
    assert.include(
      result.out.join("\n"),
      "Set these environment variables:\n  github: GITHUB_TOKEN",
    );
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("an empty answer to an input prompt falls back to an env reference", () =>
  Effect.gen(function* () {
    const { fs, config, run } = yield* setup;
    const result = yield* run([], [enter, enter, enter, enter, enter, enter, enter]);
    assert.strictEqual(result.code, 0);
    const servers = JSON.parse(yield* fs.readFileString(config)).mcpServers;
    assert.deepStrictEqual(servers.docs.headers, { Authorization: "Bearer ${DOCS_KEY}" });
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("deselecting an MCP server leaves it out and skips its input prompts", () =>
  Effect.gen(function* () {
    const { fs, config, run } = yield* setup;
    // skills, MCP servers (deselect docs, the second), agents, scope, mode, confirm
    const result = yield* run([], [enter, key("down"), space, enter, enter, enter, enter, enter]);
    assert.strictEqual(result.code, 0);
    assert.notInclude(result.screen.join(""), "docs: Docs key");
    assert.deepStrictEqual(Object.keys(JSON.parse(yield* fs.readFileString(config)).mcpServers), [
      "github",
    ]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("a selection flag skips the MCP prompt", () =>
  Effect.gen(function* () {
    const { fs, config, run } = yield* setup;
    // agents, scope, mode, confirm
    const result = yield* run(["-s", "alpha"], [enter, enter, enter, enter]);
    assert.strictEqual(result.code, 0);
    assert.notInclude(result.screen.join(""), "Which MCP servers?");
    assert.isFalse(yield* fs.exists(config));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("a Skillset with only MCP Entries skips the skills question", () =>
  Effect.gen(function* () {
    const { fs, dir, cwd, home, upstream } = yield* setup;
    const file = `${dir}/mcp-only.json`;
    yield* fs.writeFileString(
      file,
      JSON.stringify({ $schema: SCHEMA_URL, skills: [], mcp: [github] }),
    );
    const result = yield* runCli(["install", "--set", file], {
      cwd,
      home,
      upstream,
      tty: true,
      keys: [enter, enter, enter, enter, enter],
    });
    assert.strictEqual(result.code, 0);
    const screen = result.screen.join("");
    assert.notInclude(screen, "Which skills?");
    assert.include(screen, "Which MCP servers?");
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

const existing = '{"mcpServers":{"docs":{"type":"http","url":"https://mcp.mine.example/mcp"}}}';

it.effect("declining the overwrite keeps the existing server and shows both versions", () =>
  Effect.gen(function* () {
    const { fs, cwd, config, run } = yield* setup;
    yield* fs.makeDirectory(cwd, { recursive: true });
    yield* fs.writeFileString(config, existing);
    // docs key, scope, confirm, overwrite (default no)
    const result = yield* run(
      ["-m", "docs", "-a", "claude-code", "--copy"],
      [enter, enter, enter, enter],
    );
    assert.strictEqual(result.code, 0);
    const shown = result.out.join("\n") + result.screen.join("");
    assert.include(shown, "mcp.mine.example");
    assert.include(shown, "mcp.example.com");
    assert.include(shown, "Overwrite MCP server docs?");
    assert.strictEqual(yield* fs.readFileString(config), existing);
    assert.include(result.err.join("\n"), "kept the existing MCP server docs");
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("accepting the overwrite replaces the existing server", () =>
  Effect.gen(function* () {
    const { fs, cwd, config, run } = yield* setup;
    yield* fs.makeDirectory(cwd, { recursive: true });
    yield* fs.writeFileString(config, existing);
    const result = yield* run(
      ["-m", "docs", "-a", "claude-code", "--copy"],
      [enter, enter, enter, key("y", "y")],
    );
    assert.strictEqual(result.code, 0);
    assert.strictEqual(
      JSON.parse(yield* fs.readFileString(config)).mcpServers.docs.url,
      "https://mcp.example.com/mcp",
    );
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("quitting at the overwrite prompt leaves the config untouched", () =>
  Effect.gen(function* () {
    const { fs, cwd, config, run } = yield* setup;
    yield* fs.makeDirectory(cwd, { recursive: true });
    yield* fs.writeFileString(config, existing);
    const result = yield* run(
      ["-m", "docs", "-a", "claude-code", "--copy"],
      [enter, enter, enter, key("escape")],
    );
    assert.strictEqual(result.code, 130);
    assert.strictEqual(yield* fs.readFileString(config), existing);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("quitting at an input or MCP prompt installs nothing", () =>
  Effect.gen(function* () {
    const { fs, config, run, installCalls } = yield* setup;
    for (const keys of [
      [enter, key("escape")],
      [enter, enter, key("escape")],
    ]) {
      const result = yield* run([], keys);
      assert.strictEqual(result.code, 130);
    }
    assert.isFalse(yield* fs.exists(config));
    assert.deepStrictEqual(installCalls, []);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("without a terminal and without -y no MCP prompt runs and the install proceeds", () =>
  Effect.gen(function* () {
    const { fs, file, cwd, home, config, upstream } = yield* setup;
    const result = yield* runCli(["install", "--set", file], { cwd, home, upstream });
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(Object.keys(JSON.parse(yield* fs.readFileString(config)).mcpServers), [
      "github",
      "docs",
    ]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);
