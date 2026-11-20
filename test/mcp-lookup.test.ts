import { assert, it } from "@effect/vitest";
import { toLaunch } from "../src/agents/launch.ts";
import type { McpEntry } from "../src/mcp-entry.ts";
import { resolveMcp } from "../src/mcp-inputs.ts";

const entry: McpEntry = {
  name: "constructor",
  launch: { type: "command", command: "run", args: ["{constructor}", "{toString}", "{name}"] },
  inputs: [{ name: "name", kind: "variable", required: true }],
};

it("a {name} no input declares stays literal, even for Object.prototype keys", () => {
  const launch = toLaunch(resolveMcp(entry), (name) => `$${name}`);
  assert.deepStrictEqual(launch, {
    type: "stdio",
    command: "run",
    args: ["{constructor}", "{toString}", "$CONSTRUCTOR_NAME"],
    env: {},
  });
});
