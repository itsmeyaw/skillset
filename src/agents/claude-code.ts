import { join } from "node:path";
import type { ResolvedMcp } from "../mcp-inputs.ts";
import type { Agent, McpScope } from "./agent.ts";
import { installJsonMcp } from "./json-config.ts";
import { toLaunch } from "./launch.ts";

// Claude Code docs, "Environment variable expansion in .mcp.json": ${VAR} in command, args, env, url, headers.
const envRef = (name: string) => `\${${name}}`;

// Claude Code docs, "Installing MCP servers": remote entries need a type; streamable-http is "http".
export const claudeEntry = (resolved: ResolvedMcp) => {
  const launch = toLaunch(resolved, envRef);
  if (launch.type === "remote")
    return {
      type: launch.transport === "sse" ? "sse" : "http",
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

// Claude Code docs, "MCP installation scopes": project scope is .mcp.json, user scope is ~/.claude.json.
const claudeFile: NonNullable<Agent["file"]> = (scope, { paths }) =>
  scope === "project" ? join(paths.cwd, ".mcp.json") : join(paths.home, ".claude.json");

export const claudeCode: Agent = {
  id: "claude-code",
  name: "Claude Code",
  file: claudeFile,
  installMcp: (servers, { scope, paths, env, confirmOverwrite }) =>
    installJsonMcp(
      claudeFile(scope, { paths, env }),
      ["mcpServers"],
      servers.map((server) => ({ name: server.entry.name, value: claudeEntry(server) })),
      confirmOverwrite,
    ),
  warning: (scope: McpScope) =>
    scope === "global"
      ? "A running Claude Code rewrites ~/.claude.json and can overwrite these MCP servers; close it before installing, or install again after it exits."
      : "Claude Code asks you to approve project MCP servers in .mcp.json before it uses them.",
};
