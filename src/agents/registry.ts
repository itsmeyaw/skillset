import type { Agent } from "./agent.ts";
import { claudeCode } from "./claude-code.ts";
import { cursor } from "./cursor.ts";
import { geminiCli } from "./gemini-cli.ts";
import { githubCopilot } from "./github-copilot.ts";
import { kiro } from "./kiro.ts";
import { roo } from "./roo.ts";
import { windsurf } from "./windsurf.ts";

// ADR 0007: ids match the skills Agent ids; an id with no module here cannot receive MCP Entries.
const agents: ReadonlyArray<Agent> = [
  claudeCode,
  cursor,
  geminiCli,
  githubCopilot,
  kiro,
  roo,
  windsurf,
];

export const findMcpAgent = (id: string) => agents.find((agent) => agent.id === id);
