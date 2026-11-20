import type { McpEntry } from "../src/mcp-entry.ts";

const origin = { registry: "https://registry.modelcontextprotocol.io", name: "x/y", version: "1" };

export const github: McpEntry = {
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
};
export const docs: McpEntry = {
  name: "docs",
  launch: {
    type: "remote",
    transport: "streamable-http",
    url: "https://mcp.example.com/mcp",
    headers: [{ name: "Authorization", value: "Bearer {key}" }],
  },
  inputs: [{ name: "key", kind: "variable", secret: true }],
};
export const events: McpEntry = {
  name: "events",
  launch: { type: "remote", transport: "sse", url: "https://mcp.example.com/sse" },
};
