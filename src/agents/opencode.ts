import { join } from "node:path";
import type { ResolvedMcp } from "../mcp-inputs.ts";
import type { Agent } from "./agent.ts";
import { existingJsonFile, isObject } from "./json-config.ts";
import { toLaunch } from "./launch.ts";

// OpenCode docs, "MCP servers" (https://opencode.ai/docs/mcp-servers): {env:NAME} in environment and headers.
const envRef = (name: string) => `{env:${name}}`;

// OpenCode docs, "Local" and "Remote": a local server is a command list with `environment`; a remote server is
// a url with `headers` and covers both transports (streamable-http and sse), so only the type tells them from local.
export const opencodeEntry = (resolved: ResolvedMcp) => {
  const launch = toLaunch(resolved, envRef);
  if (launch.type === "remote")
    return {
      type: "remote",
      url: launch.url,
      ...(Object.keys(launch.headers).length > 0 ? { headers: launch.headers } : {}),
    };
  return {
    type: "local",
    command: [launch.command, ...launch.args],
    ...(Object.keys(launch.env).length > 0 ? { environment: launch.env } : {}),
  };
};

// OpenCode docs, "V1 to V2 migration" (https://opencode.ai/docs/migrate-v1): V2 keeps servers under `mcp.servers`,
// V1 puts them straight under `mcp`, and V2 still reads V1 files. A file whose `mcp` holds V1 servers keeps its shape;
// every other file gets V2.
export const opencodeKeyPath = (root: Record<string, unknown>): ReadonlyArray<string> => {
  const { mcp } = root;
  const v1 =
    isObject(mcp) &&
    !("servers" in mcp) &&
    Object.values(mcp).some(
      (server) => isObject(server) && (server.type === "local" || server.type === "remote"),
    );
  return v1 ? ["mcp"] : ["mcp", "servers"];
};

// OpenCode docs, "OpenCode configuration" (https://opencode.ai/docs/config): opencode.json(c) in the project,
// ~/.config/opencode/opencode.json(c) for every project.
// shortcut: .opencode/opencode.json(c) and $XDG_CONFIG_HOME are ignored, revisit if users keep servers there.
export const opencode: Agent = {
  id: "opencode",
  name: "OpenCode",
  file: (scope, { paths }) =>
    existingJsonFile(
      join(scope === "project" ? paths.cwd : join(paths.home, ".config", "opencode"), "opencode"),
    ),
  keyPath: opencodeKeyPath,
  entry: opencodeEntry,
};
