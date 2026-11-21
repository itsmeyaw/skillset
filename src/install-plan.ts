import { Console, Effect } from "effect";
import type { Agent as McpAgent } from "./agents/agent.ts";
import { findMcpAgent } from "./agents/mcp-agents.ts";
import { CliMessageError, emptySkillsetMessage } from "./errors.ts";
import type { InstallPlan } from "./install-types.ts";
import { promptableInputs, type ResolvedMcp, resolveMcp } from "./mcp-inputs.ts";
import type { PlanPrompter } from "./prompts/prompter.ts";
import type { Skillset } from "./skillset-file.ts";
import {
  isEmpty,
  selectMcpEntries,
  selectSkillEntries,
  unknownMcpNamesMessage,
  unknownNamesMessage,
} from "./skillset-store.ts";
import { Upstream, type Agent } from "./upstream.ts";

export type { InstallPlan } from "./install-types.ts";

export type InstallPlanOptions = {
  readonly selected: ReadonlyArray<string>;
  readonly selectedMcp: ReadonlyArray<string>;
  readonly agents: ReadonlyArray<string>;
  readonly global: boolean;
  readonly copy: boolean;
};

// MCP Entries go to this Agent when no Agents were chosen at all.
const defaultMcpAgent = "claude-code";

// Spec #37, User Story 57: MCP servers go to the same Agents as skills; Universal is not an Agent,
// so a chosen Universal stands for the detected Universal Agents that can receive MCP Entries.
const resolveMcpTargets = (
  agents: ReadonlyArray<string> | undefined,
  detectedUniversal: ReadonlyArray<string>,
) => {
  const chosen = agents ?? [defaultMcpAgent];
  const ids = new Set(chosen.filter((id) => id !== "universal"));
  if (chosen.includes("universal"))
    for (const id of detectedUniversal) if (findMcpAgent(id) !== undefined) ids.add(id);
  const targets: Array<McpAgent> = [];
  const unsupported: Array<string> = [];
  for (const id of ids) {
    const agent = findMcpAgent(id);
    if (agent === undefined) unsupported.push(id);
    else targets.push(agent);
  }
  return { targets, unsupported };
};

// Spec #1, install: one Universal choice represents agents sharing .agents/skills.
const agentChoices = (supported: ReadonlyArray<Agent>, detected: ReadonlyArray<Agent>) => {
  const defaults = ["universal", "claude-code"].filter((id) =>
    supported.some((agent) => agent.id === id),
  );
  for (const agent of supported) {
    if (
      !agent.universal &&
      detected.some((found) => found.id === agent.id) &&
      !defaults.includes(agent.id)
    )
      defaults.push(agent.id);
  }
  const members = supported.filter((agent) => agent.universal && agent.id !== "universal");
  const description =
    members
      .slice(0, 8)
      .map((agent) => agent.name)
      .join(", ") + (members.length > 8 ? ` +${members.length - 8} more` : "");
  const choices = supported
    .filter((agent) => !agent.universal || agent.id === "universal")
    .sort((a, b) => Number(b.id === "universal") - Number(a.id === "universal"))
    .map((agent) => ({
      title: agent.id === "universal" ? "Universal (.agents/skills)" : agent.name,
      value: agent.id,
      ...(agent.id === "universal"
        ? { description, keywords: members.map((member) => member.name).join(" ") }
        : {}),
      selected: defaults.includes(agent.id),
    }));
  return { defaults, choices };
};

export const buildInstallPlan = Effect.fn("buildInstallPlan")(function* (
  skillset: Skillset,
  options: InstallPlanOptions,
  prompter: PlanPrompter,
) {
  if (isEmpty(skillset)) {
    yield* Console.log(emptySkillsetMessage);
    return;
  }
  const unknownSkills = selectSkillEntries(skillset, options.selected).unknown;
  const unknownMcp = selectMcpEntries(skillset, options.selectedMcp).unknown;
  if (unknownSkills.length > 0 || unknownMcp.length > 0)
    return yield* new CliMessageError({
      message: [
        ...(unknownSkills.length > 0 ? [unknownNamesMessage(unknownSkills)] : []),
        ...(unknownMcp.length > 0 ? [unknownMcpNamesMessage(skillset, unknownMcp)] : []),
      ].join("; "),
    });
  // Spec #37, User Story 53: any selection flag limits the install to the selected Entries of either kind.
  const selecting = options.selected.length > 0 || options.selectedMcp.length > 0;
  let names = options.selected;
  if (!selecting && skillset.skills.length > 0) {
    names = yield* prompter.requiredSkills(
      skillset.skills.map((skillEntry) => ({
        title: skillEntry.name,
        value: skillEntry.name,
        selected: true,
      })),
    );
  }
  // Spec #37, User Story 55: the MCP question appears only when the Skillset has MCP Entries.
  let mcpEntries =
    options.selectedMcp.length > 0
      ? selectMcpEntries(skillset, options.selectedMcp).mcpEntries
      : selecting
        ? []
        : skillset.mcp;
  if (!selecting && mcpEntries.length > 0) {
    const chosen = yield* prompter.mcpServers(
      mcpEntries.map((mcpEntry) => ({
        title: mcpEntry.name,
        value: mcpEntry.name,
        selected: true,
      })),
    );
    if (chosen !== undefined)
      mcpEntries = mcpEntries.filter((entry) => chosen.includes(entry.name));
  }
  const resolvedMcp: Array<ResolvedMcp> = [];
  for (const mcpEntry of mcpEntries) {
    const answers: Record<string, string> = {};
    for (const input of promptableInputs(mcpEntry)) {
      const answer = yield* prompter.mcpInput(mcpEntry, input);
      if (answer !== undefined) answers[input.name] = answer;
    }
    resolvedMcp.push(resolveMcp(mcpEntry, answers));
  }
  let agents: ReadonlyArray<string> | undefined =
    options.agents.length > 0 ? options.agents : undefined;
  let detectedUniversal: ReadonlyArray<string> = [];
  // Spec #37, User Story 57: a chosen Universal stands for the detected Universal Agents, also with -a.
  if (
    options.agents.length === 0 ||
    (mcpEntries.length > 0 && options.agents.includes("universal"))
  ) {
    const upstream = yield* Upstream;
    const detected = yield* upstream.detectAgents();
    detectedUniversal = detected.agents
      .filter((agent) => agent.universal && agent.id !== "universal")
      .map((agent) => agent.id);
    if (options.agents.length === 0) {
      const supported = yield* upstream.getSupportedAgents;
      const { defaults, choices } = agentChoices(supported, detected.agents);
      agents = yield* prompter.agents(choices, defaults, supported.length > 0);
    }
  }
  let scope: InstallPlan["scope"] = "global";
  if (!options.global) {
    scope = yield* prompter.scope();
  }
  let mode: InstallPlan["mode"] = "copy";
  if (!options.copy) {
    mode = yield* prompter.mode();
  }
  const { targets, unsupported } =
    resolvedMcp.length > 0
      ? resolveMcpTargets(agents, detectedUniversal)
      : { targets: [], unsupported: [] };
  const plan: InstallPlan = {
    skillEntries:
      selecting && options.selected.length === 0
        ? []
        : selectSkillEntries(skillset, names).skillEntries,
    agents,
    resolvedMcp,
    mcpTargets: targets,
    mcpUnsupported: unsupported,
    scope,
    mode,
  };
  if (yield* prompter.confirmPlan(plan)) return plan;
});
