import { join } from "node:path";
import { Effect } from "effect";
import type { ResolvedMcp } from "../mcp-inputs.ts";
import type { Agent } from "./agent.ts";
import { toLaunch } from "./launch.ts";

// Cursor docs, "Config interpolation" (https://cursor.com/docs/mcp.md): ${env:NAME} in command, args, env, url, headers.
const envRef = (name: string) => `\${env:${name}}`;

// Cursor docs, "STDIO server configuration" and "Remote Server": stdio entries name their type, remote entries are just a url.
export const cursorEntry = (resolved: ResolvedMcp) => {
  const launch = toLaunch(resolved, envRef);
  if (launch.type === "remote")
    return {
      url: launch.url,
      ...(Object.keys(launch.headers).length > 0 ? { headers: launch.headers } : {}),
    };
  return {
    type: "stdio",
    command: launch.command,
    args: launch.args,
    ...(Object.keys(launch.env).length > 0 ? { env: launch.env } : {}),
  };
};

// Cursor docs, "Installing MCP servers": .cursor/mcp.json in the project, ~/.cursor/mcp.json for every project.
export const cursor: Agent = {
  id: "cursor",
  name: "Cursor",
  file: (scope, { paths }) =>
    Effect.succeed(join(scope === "project" ? paths.cwd : paths.home, ".cursor", "mcp.json")),
  keyPath: ["mcpServers"],
  entry: cursorEntry,
};
