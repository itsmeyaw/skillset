import { join } from "node:path";
import { Effect } from "effect";
import type { ResolvedMcp } from "../mcp-inputs.ts";
import type { Agent, InstallScope } from "./agent.ts";
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
export const claudeCode: Agent = {
  id: "claude-code",
  name: "Claude Code",
  file: (scope, { paths }) =>
    Effect.succeed(
      scope === "project" ? join(paths.cwd, ".mcp.json") : join(paths.home, ".claude.json"),
    ),
  keyPath: ["mcpServers"],
  entry: claudeEntry,
  warning: (scope: InstallScope) =>
    scope === "global"
      ? "A running Claude Code rewrites ~/.claude.json and can overwrite these MCP servers; close it before installing, or install again after it exits."
      : "Claude Code asks you to approve project MCP servers in .mcp.json before it uses them.",
};
