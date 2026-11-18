import { NodeFileSystem } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import type { McpEntry } from "../src/mcp-entry.ts";
import { SCHEMA_URL } from "../src/skillset-file.ts";
import { key, runCli } from "./harness.ts";

const commit = "a".repeat(40);
const agent = (id: string, universal = false) => ({
  id,
  name: id,
  projectSkillsDir: `.${id}/skills`,
  globalSkillsDir: null,
  universal,
});
const remote = "https://github.com/owner/repo.git";
const secret = "ghp_" + "x".repeat(36);

const github: McpEntry = {
  name: "github",
  launch: {
    type: "package",
    registryType: "npm",
    identifier: "@scope/server-github",
    version: "1.2.3",
    runtimeArguments: ["-y"],
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
  inputs: [{ name: "key", kind: "variable", required: true }],
};

// A project with alpha and beta skills plus the github and docs MCP Entries.
const setup = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const dir = yield* fs.makeTempDirectoryScoped();
  const file = `${dir}/skillset.json`;
  yield* fs.writeFileString(
    file,
    JSON.stringify({
      $schema: SCHEMA_URL,
      skills: [
        { name: "alpha", source: "owner/repo", commit },
        { name: "bar", source: "owner/repo", commit },
      ],
      mcp: [github, docs],
    }),
  );
  const cwd = `${dir}/project`;
  const home = `${dir}/home`;
  const installCalls: Array<string> = [];
  const upstream = {
    installDir: `${dir}/skills`,
    installCalls,
    skills: { [JSON.stringify([remote, commit])]: ["alpha", "bar"] },
    supportedAgents: [agent("universal", true), agent("claude-code"), agent("cursor")],
  };
  const run = (argv: ReadonlyArray<string>, env?: Record<string, string>) =>
    runCli(["install", ...argv, "--set", file], { cwd, home, upstream, ...(env ? { env } : {}) });
  const read = (path: string) => fs.readFileString(path);
  return { fs, dir, cwd, home, installCalls, run, read, upstream };
});

const projectConfig = {
  mcpServers: {
    github: {
      type: "stdio",
      command: "npx",
      args: ["-y", "@scope/server-github@1.2.3", "--token", "${GITHUB_TOKEN}"],
      env: { LOG_LEVEL: "info" },
    },
    docs: {
      type: "http",
      url: "https://mcp.example.com/mcp",
      headers: { Authorization: "Bearer ${DOCS_KEY}" },
    },
  },
};

it.effect("install -y installs skills and MCP Entries into the project config", () =>
  Effect.gen(function* () {
    const { cwd, run, read, installCalls, dir } = yield* setup;
    const result = yield* run(["-y"]);
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(installCalls, ["https://github.com/owner/repo.git"]);
    assert.strictEqual(yield* read(`${dir}/skills/project/universal/alpha`), `${commit}:auto`);
    assert.deepStrictEqual(JSON.parse(yield* read(`${cwd}/.mcp.json`)), projectConfig);
    const out = result.out.join("\n");
    assert.include(out, "Installed alpha, bar");
    assert.include(out, `Installed MCP servers github, docs for claude-code in ${cwd}/.mcp.json`);
    assert.include(
      out,
      "Set these environment variables:\n  github: GITHUB_TOKEN\n  docs: DOCS_KEY",
    );
    assert.include(result.err.join("\n"), "approve project MCP servers");
    assert.notInclude(result.err.join("\n"), "overwrite");
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("install -y -g writes the global config and keeps unrelated settings", () =>
  Effect.gen(function* () {
    const { fs, home, run, read } = yield* setup;
    yield* fs.makeDirectory(home, { recursive: true });
    yield* fs.writeFileString(
      `${home}/.claude.json`,
      '{\n  // my settings\n  "theme": "dark",\n  "mcpServers": {\n    "mine": { "command": "x" }, // keep\n  },\n}\n',
    );
    yield* fs.chmod(`${home}/.claude.json`, 0o600);
    const result = yield* run(["-y", "-g", "-m", "github"]);
    assert.strictEqual(result.code, 0);
    const text = yield* read(`${home}/.claude.json`);
    assert.include(text, "// my settings");
    assert.include(text, "// keep");
    assert.include(text, '"theme": "dark"');
    const config = JSON.parse(text.replace(/\/\/.*$/gmu, "").replace(/,(\s*[}\]])/gu, "$1"));
    assert.deepStrictEqual(Object.keys(config.mcpServers), ["mine", "github"]);
    assert.deepStrictEqual(config.mcpServers.github, projectConfig.mcpServers.github);
    assert.strictEqual((yield* fs.stat(`${home}/.claude.json`)).mode & 0o777, 0o600);
    assert.include(result.err.join("\n"), "can overwrite these MCP servers");
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("install creates a missing config and its parent directories", () =>
  Effect.gen(function* () {
    const { fs, cwd, run } = yield* setup;
    assert.isFalse(yield* fs.exists(cwd));
    yield* run(["-y", "-m", "docs"]);
    assert.isTrue(yield* fs.exists(`${cwd}/.mcp.json`));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("an invalid config is left untouched with an error, and skills still install", () =>
  Effect.gen(function* () {
    const { fs, cwd, run, read, installCalls } = yield* setup;
    yield* fs.makeDirectory(cwd, { recursive: true });
    yield* fs.writeFileString(`${cwd}/.mcp.json`, '{ "mcpServers": { ');
    const result = yield* run(["-y", "-a", "claude-code", "cursor"]);
    assert.strictEqual(result.code, 1);
    assert.include(result.err.join("\n"), `Cannot update ${cwd}/.mcp.json`);
    assert.include(result.out.join("\n"), "MCP Entries not installed for cursor: not supported");
    assert.strictEqual(yield* read(`${cwd}/.mcp.json`), '{ "mcpServers": { ');
    assert.lengthOf(installCalls, 1);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("-m installs only that MCP Entry and -s only that skill", () =>
  Effect.gen(function* () {
    const { cwd, run, read, installCalls } = yield* setup;
    const mcpOnly = yield* run(["-y", "-m", "docs"]);
    assert.strictEqual(mcpOnly.code, 0);
    assert.deepStrictEqual(installCalls, []);
    assert.deepStrictEqual(Object.keys(JSON.parse(yield* read(`${cwd}/.mcp.json`)).mcpServers), [
      "docs",
    ]);
    const skillOnly = yield* run(["-y", "-s", "bar"]);
    assert.strictEqual(skillOnly.code, 0);
    assert.deepStrictEqual(installCalls, [remote]);
    assert.deepStrictEqual(skillOnly.out.slice(mcpOnly.out.length), ["Installed bar"]);
    assert.deepStrictEqual(Object.keys(JSON.parse(yield* read(`${cwd}/.mcp.json`)).mcpServers), [
      "docs",
    ]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("an unknown MCP Entry name fails before anything is written", () =>
  Effect.gen(function* () {
    const { fs, cwd, run, installCalls } = yield* setup;
    const result = yield* run(["-y", "-m", "nope"]);
    assert.strictEqual(result.code, 1);
    assert.include(result.err.join("\n"), "Unknown MCP servers: nope (available: github, docs)");
    assert.deepStrictEqual(installCalls, []);
    assert.isFalse(yield* fs.exists(`${cwd}/.mcp.json`));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("secrets never reach a written file", () =>
  Effect.gen(function* () {
    const { fs, cwd, dir, run } = yield* setup;
    const result = yield* run(["-y"], {
      SKILLSET_HOME: dir,
      GITHUB_TOKEN: secret,
      DOCS_KEY: secret,
    });
    assert.strictEqual(result.code, 0);
    assert.notInclude(yield* fs.readFileString(`${cwd}/.mcp.json`), secret);
    assert.notInclude(result.out.join("\n") + result.err.join("\n"), secret);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect(
  "an identical server is left alone and a different one is kept with a warning and a failing exit",
  () =>
    Effect.gen(function* () {
      const { fs, cwd, run, read } = yield* setup;
      const first = yield* run(["-y", "-m", "docs"]);
      const written = yield* read(`${cwd}/.mcp.json`);
      const again = yield* run(["-y", "-m", "docs"]);
      assert.strictEqual(again.code, 0);
      assert.strictEqual(yield* read(`${cwd}/.mcp.json`), written);
      assert.deepStrictEqual(again.out.slice(first.out.length), [
        "Set these environment variables:\n  docs: DOCS_KEY",
      ]);
      const edited = written.replace("mcp.example.com", "mcp.mine.example");
      yield* fs.writeFileString(`${cwd}/.mcp.json`, edited);
      const differing = yield* run(["-y", "-m", "docs"]);
      assert.strictEqual(differing.code, 1);
      assert.strictEqual(yield* read(`${cwd}/.mcp.json`), edited);
      const errors = differing.err.slice(again.err.length).join("\n");
      assert.include(errors, "kept the existing MCP server docs");
      assert.include(errors, "MCP server docs not installed for claude-code");
    }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("a Skillset without MCP Entries prints and writes nothing MCP-related", () =>
  Effect.gen(function* () {
    const { fs, cwd, home, dir } = yield* setup;
    const file = `${dir}/skills-only.json`;
    yield* fs.writeFileString(
      file,
      JSON.stringify({
        $schema: SCHEMA_URL,
        skills: [{ name: "alpha", source: "owner/repo", commit }],
      }),
    );
    const result = yield* runCli(["install", "-y", "--set", file], {
      cwd,
      home,
      upstream: {
        installDir: `${dir}/skills`,
        skills: { [JSON.stringify([remote, commit])]: ["alpha"] },
      },
    });
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(result.out, ["Installed alpha"]);
    assert.deepStrictEqual(result.err, []);
    assert.isFalse(yield* fs.exists(`${cwd}/.mcp.json`));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("an MCP-only Skillset installs without a skills prompt", () =>
  Effect.gen(function* () {
    const { fs, cwd, home, dir } = yield* setup;
    const file = `${dir}/mcp-only.json`;
    yield* fs.writeFileString(
      file,
      JSON.stringify({ $schema: SCHEMA_URL, skills: [], mcp: [docs] }),
    );
    const result = yield* runCli(["install", "-y", "--set", file], { cwd, home });
    assert.strictEqual(result.code, 0);
    assert.isTrue(yield* fs.exists(`${cwd}/.mcp.json`));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("an interactive install of an MCP-only Skillset asks no skills question", () =>
  Effect.gen(function* () {
    const { fs, cwd, home, dir } = yield* setup;
    const file = `${dir}/mcp-only.json`;
    yield* fs.writeFileString(
      file,
      JSON.stringify({ $schema: SCHEMA_URL, skills: [], mcp: [docs] }),
    );
    const result = yield* runCli(["install", "--set", file], {
      cwd,
      home,
      tty: true,
      keys: Array.from({ length: 6 }, () => key("enter")),
    });
    assert.strictEqual(result.code, 0);
    const screen = result.screen.join("");
    assert.notInclude(screen, "Which skills?");
    assert.include(result.out.join("\n"), "MCP servers:\n  docs (https://mcp.example.com/mcp)");
    assert.isTrue(yield* fs.exists(`${cwd}/.mcp.json`));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);
