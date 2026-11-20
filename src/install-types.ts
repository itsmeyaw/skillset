import type { McpEntry } from "./mcp-entry.ts";
import type { McpAnswers } from "./mcp-inputs.ts";
import type { SkillEntry } from "./skillset-file.ts";
import type { InstallChoices } from "./upstream.ts";

export type InstallPlan = {
  readonly skillEntries: ReadonlyArray<SkillEntry>;
  readonly mcpEntries: ReadonlyArray<McpEntry>;
  readonly mcpAnswers: McpAnswers;
  readonly agents: ReadonlyArray<string> | undefined;
  // Detected Agents that the Universal choice stands for; MCP Entries go to them too.
  readonly detectedUniversalAgents?: ReadonlyArray<string>;
  readonly scope: InstallChoices["scope"];
  readonly mode: InstallChoices["mode"];
};
