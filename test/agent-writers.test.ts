import { NodeFileSystem } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import { parse } from "jsonc-parser";
import { cursorEntry } from "../src/agents/cursor.ts";
import { geminiEntry } from "../src/agents/gemini-cli.ts";
import { kiroEntry } from "../src/agents/kiro.ts";
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

// Where each Agent keeps its MCP servers, in project and global scope, and what it writes for them.
const agents: ReadonlyArray<{
  readonly id: string;
  readonly universal: boolean;
  readonly project: string;
  readonly global: string;
  readonly toEntry: (resolved: ReturnType<typeof resolveMcp>) => unknown;
}> = [
  {
    id: "cursor",
    universal: true,
    project: ".cursor/mcp.json",
    global: ".cursor/mcp.json",
    toEntry: cursorEntry,
  },
  {
    id: "gemini-cli",
    universal: true,
    project: ".gemini/settings.json",
    global: ".gemini/settings.json",
    toEntry: geminiEntry,
  },
  {
    id: "kiro-cli",
    universal: false,
    project: ".kiro/settings/mcp.json",
    global: ".kiro/settings/mcp.json",
    toEntry: kiroEntry,
  },
];

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
  const run = (
    argv: ReadonlyArray<string>,
    upstream: { detectedAgents?: ReturnType<typeof info>[] } = {},
  ) =>
    runCli(["install", ...argv, "--set", file], {
      cwd,
      home,
      upstream: {
        supportedAgents: [
          info("universal", true),
          info("claude-code", false),
          ...agents.map((agent) => info(agent.id, agent.universal)),
        ],
        ...upstream,
      },
    });
  return { fs, cwd, home, run };
});

const expectedServers = (toEntry: (typeof agents)[number]["toEntry"]) =>
  Object.fromEntries(
    [github, docs, events].map((entry) => [entry.name, toEntry(resolveMcp(entry))]),
  );

for (const agent of agents)
  for (const scope of ["project", "global"] as const)
    it.effect(`-a ${agent.id} writes ${scope} MCP servers and keeps the rest of the file`, () =>
      Effect.gen(function* () {
        const { fs, cwd, home, run } = yield* setup;
        const root = scope === "project" ? cwd : home;
        const file = `${root}/${agent[scope]}`;
        yield* fs.makeDirectory(file.slice(0, file.lastIndexOf("/")), { recursive: true });
        yield* fs.writeFileString(
          file,
          '{\n  // my settings\n  "theme": "dark",\n  "mcpServers": {\n    "mine": { "command": "x" }\n  }\n}\n',
        );
        const result = yield* run(["-y", "-a", agent.id, ...(scope === "global" ? ["-g"] : [])]);
        assert.strictEqual(result.code, 0);
        const text = yield* fs.readFileString(file);
        assert.include(text, "// my settings");
        const config = parse(text);
        assert.strictEqual(config.theme, "dark");
        assert.deepStrictEqual(config.mcpServers, {
          mine: { command: "x" },
          ...expectedServers(agent.toEntry),
        });
        assert.include(
          result.out.join("\n"),
          `Installed MCP servers github, docs, events for ${agent.id} in ${file}`,
        );
      }).pipe(Effect.provide(NodeFileSystem.layer)),
    );

it.effect("a detected Agent receives MCP servers by default", () =>
  Effect.gen(function* () {
    const { fs, cwd, run } = yield* setup;
    const result = yield* run(["-y"], { detectedAgents: [info("cursor", true)] });
    assert.strictEqual(result.code, 0);
    assert.isTrue(yield* fs.exists(`${cwd}/.cursor/mcp.json`));
    assert.isTrue(yield* fs.exists(`${cwd}/.mcp.json`));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("a detected non-Universal Agent receives MCP servers by default", () =>
  Effect.gen(function* () {
    const { fs, cwd, run } = yield* setup;
    const result = yield* run(["-y"], { detectedAgents: [info("kiro-cli", false)] });
    assert.strictEqual(result.code, 0);
    assert.isTrue(yield* fs.exists(`${cwd}/.kiro/settings/mcp.json`));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("an undetected Agent receives nothing by default", () =>
  Effect.gen(function* () {
    const { fs, cwd, run } = yield* setup;
    const result = yield* run(["-y"]);
    assert.strictEqual(result.code, 0);
    assert.isFalse(yield* fs.exists(`${cwd}/.cursor/mcp.json`));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);
