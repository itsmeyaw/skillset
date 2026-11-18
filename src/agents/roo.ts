import { join } from "node:path";
import type { ResolvedMcp } from "../mcp-inputs.ts";
import type { Agent } from "./agent.ts";
import { installJsonMcp } from "./json-config.ts";
import { toLaunch } from "./launch.ts";

// Roo Code docs, "Using System Environment Variables in Arguments" (https://docs.roocode.com/features/mcp/using-mcp-in-roo):
// ${env:NAME}; Roo Code injects it into the whole server entry, so env and headers work too (McpHub.ts, injectVariables).
const envRef = (name: string) => `\${env:${name}}`;

// Roo Code docs, "Streamable HTTP configuration parameters": a url entry must name its type, "sse" or "streamable-http".
export const rooEntry = (resolved: ResolvedMcp) => {
  const launch = toLaunch(resolved, envRef);
  if (launch.type === "remote")
    return {
      type: launch.transport,
      url: launch.url,
      ...(Object.keys(launch.headers).length > 0 ? { headers: launch.headers } : {}),
    };
  return {
    command: launch.command,
    args: launch.args,
    ...(Object.keys(launch.env).length > 0 ? { env: launch.env } : {}),
  };
};

// Roo Code docs, "Configuring MCP Servers": .roo/mcp.json per project; the global mcp_settings.json lives in the
// extension's VS Code globalStorage (src/shared/globalFileNames.ts, publisher RooVeterinaryInc, name roo-cline).
// shortcut: only stable VS Code with default storage; Insiders, VSCodium and a custom storage path are not found, revisit on request.
export const rooGlobalFile = (home: string, platform: string) =>
  join(
    platform === "darwin"
      ? join(home, "Library", "Application Support")
      : platform === "win32"
        ? join(home, "AppData", "Roaming")
        : join(home, ".config"),
    "Code",
    "User",
    "globalStorage",
    "rooveterinaryinc.roo-cline",
    "settings",
    "mcp_settings.json",
  );

export const roo: Agent = {
  id: "roo",
  name: "Roo Code",
  installMcp: (servers, { scope, paths, confirmOverwrite }) =>
    installJsonMcp(
      scope === "project"
        ? join(paths.cwd, ".roo", "mcp.json")
        : rooGlobalFile(paths.home, process.platform),
      ["mcpServers"],
      servers.map((server) => ({ name: server.entry.name, value: rooEntry(server) })),
      confirmOverwrite,
    ),
};
