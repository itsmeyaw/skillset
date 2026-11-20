import { join } from "node:path";
import type { Agent } from "./agent.ts";
import { ampEntry } from "./amp.ts";
import { installJsonMcp } from "./json-config.ts";

// Kiro docs, "Environment variables" (https://kiro.dev/docs/mcp/configuration/) and "Configuration properties": the
// entry shape and ${NAME} references match Amp's, so ampEntry builds them.
// Kiro docs, "Configuration locations": .kiro/settings/mcp.json per workspace, ~/.kiro/settings/mcp.json per user.
export const kiro: Agent = {
  id: "kiro-cli",
  name: "Kiro",
  installMcp: (servers, { scope, paths, confirmOverwrite }) =>
    installJsonMcp(
      join(scope === "project" ? paths.cwd : paths.home, ".kiro", "settings", "mcp.json"),
      ["mcpServers"],
      servers.map((server) => ({ name: server.entry.name, value: ampEntry(server) })),
      confirmOverwrite,
    ),
};
