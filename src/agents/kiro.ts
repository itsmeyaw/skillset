import { join } from "node:path";
import type { ResolvedMcp } from "../mcp-inputs.ts";
import type { Agent } from "./agent.ts";
import { installJsonMcp } from "./json-config.ts";
import { toLaunch } from "./launch.ts";

// Kiro docs, "Environment variables" (https://kiro.dev/docs/mcp/configuration/): ${NAME} references in env and headers.
const envRef = (name: string) => `\${${name}}`;

// Kiro docs, "Configuration properties": local servers are command, args and env; remote servers are url and headers.
export const kiroEntry = (resolved: ResolvedMcp) => {
  const launch = toLaunch(resolved, envRef);
  if (launch.type === "remote")
    return {
      url: launch.url,
      ...(Object.keys(launch.headers).length > 0 ? { headers: launch.headers } : {}),
    };
  return {
    command: launch.command,
    args: launch.args,
    ...(Object.keys(launch.env).length > 0 ? { env: launch.env } : {}),
  };
};

// Kiro docs, "Configuration locations": .kiro/settings/mcp.json per workspace, ~/.kiro/settings/mcp.json per user.
export const kiro: Agent = {
  id: "kiro-cli",
  name: "Kiro",
  installMcp: (servers, { scope, paths, confirmOverwrite }) =>
    installJsonMcp(
      join(scope === "project" ? paths.cwd : paths.home, ".kiro", "settings", "mcp.json"),
      ["mcpServers"],
      servers.map((server) => ({ name: server.entry.name, value: kiroEntry(server) })),
      confirmOverwrite,
    ),
};
