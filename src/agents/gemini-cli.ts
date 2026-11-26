import { join } from "node:path";
import { Effect } from "effect";
import type { ResolvedMcp } from "../mcp-inputs.ts";
import type { Agent } from "./agent.ts";
import { toLaunch } from "./launch.ts";

// Gemini CLI docs, "Environment variable expansion" (https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md): $NAME or ${NAME} in env and headers.
// shortcut: Gemini CLI does not expand references in args or url, so a secret variable there stays literal; revisit if its docs add it.
const envRef = (name: string) => `\${${name}}`;

// Gemini CLI docs, "Configuration properties": url is an SSE endpoint, httpUrl a streamable HTTP endpoint; no type field.
export const geminiEntry = (resolved: ResolvedMcp) => {
  const launch = toLaunch(resolved, envRef);
  if (launch.type === "remote")
    return {
      [launch.transport === "sse" ? "url" : "httpUrl"]: launch.url,
      ...(Object.keys(launch.headers).length > 0 ? { headers: launch.headers } : {}),
    };
  return {
    command: launch.command,
    args: launch.args,
    ...(Object.keys(launch.env).length > 0 ? { env: launch.env } : {}),
  };
};

// Gemini CLI docs, docs/reference/configuration.md: .gemini/settings.json in the project, ~/.gemini/settings.json for the user.
export const geminiCli: Agent = {
  id: "gemini-cli",
  name: "Gemini CLI",
  file: (scope, { paths }) =>
    Effect.succeed(join(scope === "project" ? paths.cwd : paths.home, ".gemini", "settings.json")),
  keyPath: ["mcpServers"],
  entry: geminiEntry,
};
