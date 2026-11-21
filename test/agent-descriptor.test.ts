import { NodeServices } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import { parse } from "jsonc-parser";
import type { Agent } from "../src/agents/agent.ts";
import { writeAgentMcp } from "../src/agents/json-config.ts";
import { resolveMcp } from "../src/mcp-inputs.ts";
import { groupByFile } from "../src/mcp-install.ts";
import { docs, github } from "./mcp-fixtures.ts";

const context = { paths: { cwd: "/work", home: "/home" }, env: {} };

const fake = (id: string, file: string, keyPath: Agent["keyPath"] = ["servers"]): Agent => ({
  id,
  name: id,
  file: (scope) => Effect.succeed(`${scope}:${file}`),
  keyPath,
  entry: (resolved, scope) => ({ id, scope, name: resolved.entry.name }),
});

it.effect("Agents that resolve to the same file are grouped and written once", () =>
  Effect.gen(function* () {
    const one = fake("one", "shared.json");
    const two = fake("two", "shared.json");
    const three = fake("three", "own.json");
    const groups = yield* groupByFile([one, three, two], "project", context);
    assert.deepStrictEqual(
      groups.map((group) => ({ file: group.file, ids: group.agents.map((agent) => agent.id) })),
      [
        { file: "project:shared.json", ids: ["one", "two"] },
        { file: "project:own.json", ids: ["three"] },
      ],
    );
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("writeAgentMcp writes each server with the Agent's entry under its key path", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/nested.json`;
    const agent = fake("nested", "x", ["a", "b"]);
    const outcomes = yield* writeAgentMcp(agent, file, [resolveMcp(github), resolveMcp(docs)], {
      scope: "global",
      confirmOverwrite: () => Effect.succeed(false),
    });
    assert.deepStrictEqual(
      outcomes.map((outcome) => [outcome.name, outcome.status]),
      [
        ["github", "written"],
        ["docs", "written"],
      ],
    );
    assert.deepStrictEqual(parse(yield* fs.readFileString(file)), {
      a: {
        b: {
          github: { id: "nested", scope: "global", name: "github" },
          docs: { id: "nested", scope: "global", name: "docs" },
        },
      },
    });
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
