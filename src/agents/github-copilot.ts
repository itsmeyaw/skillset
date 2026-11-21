import { join } from "node:path";
import { Effect } from "effect";
import type { ResolvedMcp } from "../mcp-inputs.ts";
import type { Agent, McpScope } from "./agent.ts";
import { claudeEntry } from "./claude-code.ts";
import { toLaunch } from "./launch.ts";

// Copilot CLI docs, "MCP server configuration" (https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference):
// ${VAR} expands in env and headers.
const envRef = (name: string) => `\${${name}}`;

// Copilot CLI docs, "Adding per-repository MCP servers" (https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers):
// project .mcp.json files use the mcpServers format of Claude Code and need no tools list, so Copilot writes
// exactly Claude Code's entry there; the file is shared and both Agents must produce the same bytes.
// The user mcp-config.json requires type and tools: "local" or "stdio" for local servers, "http" or "sse" for remote.
export const copilotEntry = (resolved: ResolvedMcp, scope: McpScope) => {
  if (scope === "project") return claudeEntry(resolved);
  const launch = toLaunch(resolved, envRef);
  if (launch.type === "remote")
    return {
      type: launch.transport === "sse" ? "sse" : "http",
      url: launch.url,
      ...(Object.keys(launch.headers).length > 0 ? { headers: launch.headers } : {}),
      tools: ["*"],
    };
  return {
    type: "local",
    command: launch.command,
    args: launch.args,
    ...(Object.keys(launch.env).length > 0 ? { env: launch.env } : {}),
    tools: ["*"],
  };
};

// Copilot CLI docs, "Command reference, environment variables": COPILOT_HOME replaces the default ~/.copilot.
export const githubCopilot: Agent = {
  id: "github-copilot",
  name: "GitHub Copilot",
  file: (scope, { paths, env }) =>
    Effect.succeed(
      scope === "project"
        ? join(paths.cwd, ".mcp.json")
        : join(env.COPILOT_HOME || join(paths.home, ".copilot"), "mcp-config.json"),
    ),
  keyPath: ["mcpServers"],
  entry: copilotEntry,
  warning: (scope) =>
    scope === "project"
      ? "Copilot CLI loads project MCP servers from .mcp.json only after you trust the folder."
      : undefined,
};
