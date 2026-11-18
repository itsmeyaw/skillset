import { join } from "node:path";
import type { ResolvedMcp } from "../mcp-inputs.ts";
import type { Agent } from "./agent.ts";
import { installJsonMcp } from "./json-config.ts";
import { toLaunch } from "./launch.ts";

// Devin Desktop (Windsurf) docs, "Config Interpolation" (https://docs.devin.ai/windsurf/plugins/cascade/mcp.md):
// ${env:NAME} in command, args, env, serverUrl, url and headers.
const envRef = (name: string) => `\${env:${name}}`;

// Devin CLI docs, "Server Configuration Options" (https://docs.devin.ai/cli/extensibility/mcp/configuration.md):
// remote servers use url, with transport "http" (streamable HTTP) or "sse".
export const windsurfEntry = (resolved: ResolvedMcp) => {
  const launch = toLaunch(resolved, envRef);
  if (launch.type === "remote")
    return {
      url: launch.url,
      transport: launch.transport === "sse" ? "sse" : "http",
      ...(Object.keys(launch.headers).length > 0 ? { headers: launch.headers } : {}),
    };
  return {
    command: launch.command,
    args: launch.args,
    ...(Object.keys(launch.env).length > 0 ? { env: launch.env } : {}),
  };
};

// Devin Desktop docs, "Devin Local Customizations": .devin/mcp_config.json per project, ~/.config/devin/mcp_config.json
// per user (%APPDATA%/devin on Windows). The legacy Windsurf file ~/.codeium/windsurf/mcp_config.json (key serverUrl)
// is only imported by the editor's discovery setting, so it is not written.
// shortcut: $XDG_CONFIG_HOME is ignored, revisit if users report the file in the wrong place.
export const windsurfGlobalFile = (home: string, platform: string) =>
  join(
    platform === "win32" ? join(home, "AppData", "Roaming") : join(home, ".config"),
    "devin",
    "mcp_config.json",
  );

export const windsurf: Agent = {
  id: "windsurf",
  name: "Windsurf",
  installMcp: (servers, { scope, paths, confirmOverwrite }) =>
    installJsonMcp(
      scope === "project"
        ? join(paths.cwd, ".devin", "mcp_config.json")
        : windsurfGlobalFile(paths.home, process.platform),
      ["mcpServers"],
      servers.map((server) => ({ name: server.entry.name, value: windsurfEntry(server) })),
      confirmOverwrite,
    ),
};
