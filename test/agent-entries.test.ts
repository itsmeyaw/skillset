import { assert, it } from "@effect/vitest";
import { cursorEntry } from "../src/agents/cursor.ts";
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
];

for (const { id, toEntry, cases } of agents)
  for (const { entry, expected } of cases)
    it(`${id} maps ${entry.name}`, () => {
      assert.deepStrictEqual(toEntry(resolveMcp(entry)), expected);
    });
