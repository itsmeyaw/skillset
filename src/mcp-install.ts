import { Console, Effect } from "effect";
import { AgentPaths, type McpOutcome } from "./agents/agent.ts";
import { findMcpAgent } from "./agents/registry.ts";
import type { InstallPlan } from "./install-types.ts";
import { envVarsOf, resolveMcp } from "./mcp-inputs.ts";

// Spec #37, User Story 57: MCP servers go to the same Agents as skills; Universal is not an Agent.
const mcpAgentIds = (plan: InstallPlan) => [
  ...new Set((plan.agents ?? ["claude-code"]).filter((id) => id !== "universal")),
];

// Spec #37, User Stories 66-78: write each MCP Entry for every chosen Agent, then list env vars to set.
// Returns the failures so the caller can merge them with skill failures into one exit code.
export const installMcpEntries = Effect.fn("installMcpEntries")(function* (plan: InstallPlan) {
  if (plan.mcpEntries.length === 0) return [];
  const paths = yield* AgentPaths;
  const servers = plan.mcpEntries.map(resolveMcp);
  const failures: Array<string> = [];
  for (const id of mcpAgentIds(plan)) {
    const agent = findMcpAgent(id);
    if (agent === undefined) {
      yield* Console.log(`MCP Entries not installed for ${id}: not supported`);
      continue;
    }
    const result = yield* agent
      .installMcp(servers, {
        scope: plan.scope,
        paths,
        // Issue #43 asks the user; until then a different server is always kept.
        confirmOverwrite: () => Effect.succeed(false),
      })
      .pipe(Effect.result);
    if (result._tag === "Failure") {
      failures.push(`MCP Entries not installed for ${id}: ${result.failure.message}`);
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
        `MCP server ${kept.name} not installed for ${id}: a different one exists in ${kept.file}`,
      );
    }
    const written = outcomes("written");
    if (written.length === 0) continue;
    yield* Console.log(
      `Installed MCP servers ${written.map((outcome) => outcome.name).join(", ")} for ${id} in ${written[0]!.file}`,
    );
    const warning = agent.warning?.(plan.scope);
    if (warning !== undefined) yield* Console.error(`Warning: ${warning}`);
  }
  const lines = servers.flatMap((server) => {
    const names = envVarsOf(server);
    return names.length > 0 ? [`  ${server.entry.name}: ${names.join(", ")}`] : [];
  });
  if (lines.length > 0) yield* Console.log(`Set these environment variables:\n${lines.join("\n")}`);
  return failures;
});
