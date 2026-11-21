import type { Agent } from "./agents/agent.ts";
import type { ResolvedMcp } from "./mcp-inputs.ts";
import type { SkillEntry } from "./skillset-file.ts";
import type { InstallChoices } from "./upstream.ts";

export type InstallPlan = {
  readonly skillEntries: ReadonlyArray<SkillEntry>;
  // Skill Agent ids as chosen; undefined falls through to the `skills` library's own default.
  readonly agents: ReadonlyArray<string> | undefined;
  // MCP Entries with their typed answers already resolved.
  readonly resolvedMcp: ReadonlyArray<ResolvedMcp>;
  // The Agents that receive the MCP servers, Universal already expanded.
  readonly mcpTargets: ReadonlyArray<Agent>;
  // Chosen Agent ids that have no MCP writer.
  readonly mcpUnsupported: ReadonlyArray<string>;
  readonly scope: InstallChoices["scope"];
  readonly mode: InstallChoices["mode"];
};
