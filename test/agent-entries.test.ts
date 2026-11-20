import { assert, it } from "@effect/vitest";
import { ampEntry } from "../src/agents/amp.ts";
import { cursorEntry } from "../src/agents/cursor.ts";
import { geminiEntry } from "../src/agents/gemini-cli.ts";
import { rooEntry, rooGlobalFile } from "../src/agents/roo.ts";
import { windsurfEntry, windsurfGlobalFile } from "../src/agents/windsurf.ts";
import type { McpEntry } from "../src/mcp-entry.ts";
import { resolveMcp } from "../src/mcp-inputs.ts";
import { docs, events, github } from "./mcp-fixtures.ts";

type Case = { readonly entry: McpEntry; readonly expected: unknown };

// Each Agent's entry shape and env reference syntax, taken from its documentation.
const agents: ReadonlyArray<{
  readonly id: string;
  readonly toEntry: (resolved: ReturnType<typeof resolveMcp>) => unknown;
  readonly cases: ReadonlyArray<Case>;
}> = [
  {
    id: "cursor",
    toEntry: cursorEntry,
    cases: [
      {
        entry: github,
        expected: {
          type: "stdio",
          command: "npx",
          args: ["-y", "@scope/server-github@1.2.3", "--token", "${env:GITHUB_TOKEN}"],
          env: { LOG_LEVEL: "info" },
        },
      },
      {
        entry: docs,
        expected: {
          url: "https://mcp.example.com/mcp",
          headers: { Authorization: "Bearer ${env:DOCS_KEY}" },
        },
      },
      { entry: events, expected: { url: "https://mcp.example.com/sse" } },
    ],
  },
  {
    id: "gemini-cli",
    toEntry: geminiEntry,
    cases: [
      {
        entry: github,
        expected: {
          command: "npx",
          args: ["-y", "@scope/server-github@1.2.3", "--token", "${GITHUB_TOKEN}"],
          env: { LOG_LEVEL: "info" },
        },
      },
      {
        entry: docs,
        expected: {
          httpUrl: "https://mcp.example.com/mcp",
          headers: { Authorization: "Bearer ${DOCS_KEY}" },
        },
      },
      { entry: events, expected: { url: "https://mcp.example.com/sse" } },
    ],
  },
  {
    id: "kiro-cli",
    toEntry: ampEntry,
    cases: [
      {
        entry: github,
        expected: {
          command: "npx",
          args: ["-y", "@scope/server-github@1.2.3", "--token", "${GITHUB_TOKEN}"],
          env: { LOG_LEVEL: "info" },
        },
      },
      {
        entry: docs,
        expected: {
          url: "https://mcp.example.com/mcp",
          headers: { Authorization: "Bearer ${DOCS_KEY}" },
        },
      },
      { entry: events, expected: { url: "https://mcp.example.com/sse" } },
    ],
  },
  {
    id: "roo",
    toEntry: rooEntry,
    cases: [
      {
        entry: github,
        expected: {
          command: "npx",
          args: ["-y", "@scope/server-github@1.2.3", "--token", "${env:GITHUB_TOKEN}"],
          env: { LOG_LEVEL: "info" },
        },
      },
      {
        entry: docs,
        expected: {
          type: "streamable-http",
          url: "https://mcp.example.com/mcp",
          headers: { Authorization: "Bearer ${env:DOCS_KEY}" },
        },
      },
      { entry: events, expected: { type: "sse", url: "https://mcp.example.com/sse" } },
    ],
  },
  {
    id: "windsurf",
    toEntry: windsurfEntry,
    cases: [
      {
        entry: github,
        expected: {
          command: "npx",
          args: ["-y", "@scope/server-github@1.2.3", "--token", "${env:GITHUB_TOKEN}"],
          env: { LOG_LEVEL: "info" },
        },
      },
      {
        entry: docs,
        expected: {
          url: "https://mcp.example.com/mcp",
          transport: "http",
          headers: { Authorization: "Bearer ${env:DOCS_KEY}" },
        },
      },
      { entry: events, expected: { url: "https://mcp.example.com/sse", transport: "sse" } },
    ],
  },
];

for (const { id, toEntry, cases } of agents)
  for (const { entry, expected } of cases)
    it(`${id} maps ${entry.name}`, () => {
      assert.deepStrictEqual(toEntry(resolveMcp(entry)), expected);
    });

const rooStorage = "Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json";

it.each([
  ["darwin", `/home/me/Library/Application Support/${rooStorage}`],
  ["linux", `/home/me/.config/${rooStorage}`],
  ["win32", `/home/me/AppData/Roaming/${rooStorage}`],
] as const)("roo keeps its global servers in VS Code storage on %s", (platform, expected) => {
  assert.strictEqual(rooGlobalFile("/home/me", platform), expected);
});

it.each([
  ["darwin", "/home/me/.config/devin/mcp_config.json"],
  ["linux", "/home/me/.config/devin/mcp_config.json"],
  ["win32", "/home/me/AppData/Roaming/devin/mcp_config.json"],
] as const)(
  "windsurf keeps its global servers in the Devin config directory on %s",
  (platform, expected) => {
    assert.strictEqual(windsurfGlobalFile("/home/me", platform), expected);
  },
);
