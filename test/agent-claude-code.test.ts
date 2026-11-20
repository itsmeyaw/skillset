import { assert, it } from "@effect/vitest";
import { claudeEntry } from "../src/agents/claude-code.ts";
import type { McpEntry } from "../src/mcp-entry.ts";
import { resolveMcp } from "../src/mcp-inputs.ts";

const origin = { registry: "https://registry.modelcontextprotocol.io", name: "x/y", version: "1" };

const cases: ReadonlyArray<{ title: string; entry: McpEntry; expected: unknown }> = [
  {
    title: "npm package with a secret variable argument and an env input",
    entry: {
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
        { name: "token", kind: "variable", secret: true },
        { name: "LOG_LEVEL", kind: "env", default: "info" },
      ],
      origin,
    },
    expected: {
      type: "stdio",
      command: "npx",
      args: ["-y", "@scope/server-github@1.2.3", "--token", "${GITHUB_TOKEN}"],
      env: { LOG_LEVEL: "info" },
    },
  },
  {
    title: "oci package with a secret env input and an edited env name",
    entry: {
      name: "gh.hub",
      launch: {
        type: "package",
        registryType: "oci",
        identifier: "ghcr.io/org/server:1.0.0",
        version: "1.0.0",
        runtimeArguments: ["-e", "TOKEN"],
        transport: "stdio",
      },
      inputs: [
        { name: "TOKEN", kind: "env", secret: true },
        { name: "key", kind: "variable", secret: true, env: "CUSTOM_KEY" },
      ],
      origin,
    },
    expected: {
      type: "stdio",
      command: "docker",
      args: ["run", "-i", "--rm", "-e", "TOKEN", "ghcr.io/org/server:1.0.0"],
      env: { TOKEN: "${TOKEN}" },
    },
  },
  {
    title: "pypi package with a runtime hint",
    entry: {
      name: "py",
      launch: {
        type: "package",
        registryType: "pypi",
        identifier: "mcp-py",
        version: "0.4.0",
        runtimeHint: "uvx",
        transport: "stdio",
      },
    },
    expected: { type: "stdio", command: "uvx", args: ["mcp-py==0.4.0"] },
  },
  {
    title: "manual command with a required env input without a value",
    entry: {
      name: "files",
      launch: { type: "command", command: "node", args: ["server.js", "{root}"] },
      inputs: [
        { name: "root", kind: "variable", default: "/srv" },
        { name: "API_KEY", kind: "env", required: true },
        { name: "OPTIONAL", kind: "env" },
      ],
    },
    expected: {
      type: "stdio",
      command: "node",
      args: ["server.js", "/srv"],
      env: { API_KEY: "${API_KEY}" },
    },
  },
  {
    title: "streamable-http remote with templated URL and secret header",
    entry: {
      name: "docs",
      launch: {
        type: "remote",
        transport: "streamable-http",
        url: "https://mcp.example.com/{tenant}/mcp",
        headers: [{ name: "Authorization", value: "Bearer {token}" }],
      },
      inputs: [
        { name: "tenant", kind: "variable", default: "acme" },
        { name: "token", kind: "variable", secret: true },
      ],
    },
    expected: {
      type: "http",
      url: "https://mcp.example.com/acme/mcp",
      headers: { Authorization: "Bearer ${DOCS_TOKEN}" },
    },
  },
  {
    title: "sse remote without headers",
    entry: {
      name: "events",
      launch: { type: "remote", transport: "sse", url: "https://mcp.example.com/sse" },
    },
    expected: { type: "sse", url: "https://mcp.example.com/sse" },
  },
];

it.each(cases)("claudeEntry maps $title", ({ entry, expected }) => {
  assert.deepStrictEqual(claudeEntry(resolveMcp(entry)), expected);
});
