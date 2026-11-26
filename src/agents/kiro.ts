import { join } from "node:path";
import { Effect } from "effect";
import type { Agent } from "./agent.ts";
import { ampEntry } from "./amp.ts";

// Kiro docs, "Environment variables" (https://kiro.dev/docs/mcp/configuration/) and "Configuration properties": the
// entry shape and ${NAME} references match Amp's, so ampEntry builds them.
// Kiro docs, "Configuration locations": .kiro/settings/mcp.json per workspace, ~/.kiro/settings/mcp.json per user.
export const kiro: Agent = {
  id: "kiro-cli",
  name: "Kiro",
  file: (scope, { paths }) =>
    Effect.succeed(
      join(scope === "project" ? paths.cwd : paths.home, ".kiro", "settings", "mcp.json"),
    ),
  keyPath: ["mcpServers"],
  entry: ampEntry,
};
