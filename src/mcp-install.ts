import { Console, Effect } from "effect";
import {
  type Agent,
  AgentPaths,
  type McpInstallContext,
  type McpOutcome,
  type McpScope,
} from "./agents/agent.ts";
import { writeAgentMcp } from "./agents/json-config.ts";
import type { InstallPlan } from "./install-types.ts";
import { envVarsOf } from "./mcp-inputs.ts";
import type { OverwritePrompter } from "./prompts/prompter.ts";
import { SkillsetEnvironment } from "./skillset-store.ts";

// Agents that resolve to one file (Claude Code and Copilot share .mcp.json) are written once, by the first of them.
export const groupByFile = Effect.fn("groupByFile")(function* (
  agents: ReadonlyArray<Agent>,
  scope: McpScope,
  context: Pick<McpInstallContext, "paths" | "env">,
) {
  const groups: Array<{ readonly file: string; readonly agents: Array<Agent> }> = [];
  for (const agent of agents) {
    const file = yield* agent.file(scope, context);
    const shared = groups.find((group) => group.file === file);
    if (shared) shared.agents.push(agent);
    else groups.push({ file, agents: [agent] });
  }
  return groups;
});

// Spec #37, User Stories 66-78: write each MCP Entry for every chosen Agent, then list env vars to set.
// Returns the failures so the caller can merge them with skill failures into one exit code.
export const installMcpEntries = Effect.fn("installMcpEntries")(function* (
  plan: InstallPlan,
  prompter: OverwritePrompter,
) {
  if (plan.resolvedMcp.length === 0) return [];
  const servers = plan.resolvedMcp;
  const paths = yield* AgentPaths;
  const env = yield* SkillsetEnvironment;
  const failures: Array<string> = [];
  let present = false;
  for (const id of plan.mcpUnsupported)
    yield* Console.log(`MCP Entries not installed for ${id}: not supported`);
  const groups = yield* groupByFile(plan.mcpTargets, plan.scope, { paths, env });
  if (groups.length === 0)
    failures.push("MCP Entries not installed: no chosen Agent can receive them");
  for (const { file, agents } of groups) {
    const label = agents.map((agent) => agent.id).join(", ");
    const result = yield* writeAgentMcp(agents[0]!, file, servers, {
      scope: plan.scope,
      confirmOverwrite: prompter.confirmOverwrite,
    }).pipe(Effect.result);
    if (result._tag === "Failure") {
      failures.push(`MCP Entries not installed for ${label}: ${result.failure.message}`);
      continue;
    }
    const outcomes = (status: McpOutcome["status"]) =>
      result.success.filter((outcome) => outcome.status === status);
    // Spec #37, User Story 78: a server skipped for any reason but "not supported" fails the exit code.
    for (const kept of outcomes("kept")) {
      yield* Console.error(
        `Warning: kept the existing MCP server ${kept.name} in ${kept.file}; it differs from the Skillset's entry.`,
      );
      failures.push(
        `MCP server ${kept.name} not installed for ${label}: a different one exists in ${kept.file}`,
      );
    }
    present ||= result.success.some((outcome) => outcome.status !== "kept");
    const written = outcomes("written");
    if (written.length === 0) continue;
    yield* Console.log(
      `Installed MCP servers ${written.map((outcome) => outcome.name).join(", ")} for ${label} in ${written[0]!.file}`,
    );
    for (const agent of agents) {
      const warning = agent.warning?.(plan.scope);
      if (warning !== undefined) yield* Console.error(`Warning: ${warning}`);
    }
  }
  const lines = servers.flatMap((server) => {
    const names = envVarsOf(server);
    return names.length > 0 ? [`  ${server.entry.name}: ${names.join(", ")}`] : [];
  });
  if (present && lines.length > 0)
    yield* Console.log(`Set these environment variables:\n${lines.join("\n")}`);
  return failures;
});
