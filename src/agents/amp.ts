import { join } from "node:path";
import { Effect } from "effect";
import type { ResolvedMcp } from "../mcp-inputs.ts";
import type { Agent } from "./agent.ts";
import { existingJsonFile, installJsonMcp } from "./json-config.ts";
import { toLaunch } from "./launch.ts";

// Amp docs, "MCP" (https://ampcode.com/docs/customize/mcp): ${VAR_NAME} in configuration files.
const envRef = (name: string) => `\${${name}}`;

// Amp docs, "MCP": command/args/env for local servers, url/headers for remote ones, with no type field.
export const ampEntry = (resolved: ResolvedMcp) => {
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

// Amp docs, "Configuration" (https://ampcode.com/docs/cli/settings): the key is the flat name "amp.mcpServers",
// not a nested amp object; settings.json or settings.jsonc sits in .amp (workspace) or ~/.config/amp (user).
// shortcut: only .amp in the current directory is used, not the nearest one found upward from it.
export const amp: Agent = {
  id: "amp",
  name: "Amp",
  installMcp: (servers, { scope, paths, confirmOverwrite }) =>
    Effect.gen(function* () {
      const file = yield* existingJsonFile(
        join(
          scope === "project" ? join(paths.cwd, ".amp") : join(paths.home, ".config", "amp"),
          "settings",
        ),
      );
      return yield* installJsonMcp(
        file,
        ["amp.mcpServers"],
        servers.map((server) => ({ name: server.entry.name, value: ampEntry(server) })),
        confirmOverwrite,
      );
    }),
  // Amp docs, "Workspace MCP Server Trust".
  warning: (scope) =>
    scope === "project"
      ? "Amp runs workspace MCP servers from .amp/settings.json only after you approve them; run `amp mcp approve <name>`."
      : undefined,
};
