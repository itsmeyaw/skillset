import { Console, Effect } from "effect";
import { CliMessageError, emptySkillsetMessage } from "./errors.ts";
import type { InstallPlan } from "./install-types.ts";
import { promptableInputs } from "./mcp-inputs.ts";
import type { Prompter } from "./prompts/prompter.ts";
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
  prompter: Prompter,
) {
  if (isEmpty(skillset) && (skillset.mcp ?? []).length === 0) {
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
        : (skillset.mcp ?? []);
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
  const mcpAnswers: Record<string, Record<string, string>> = {};
  for (const mcpEntry of mcpEntries)
    for (const input of promptableInputs(mcpEntry)) {
      const answer = yield* prompter.mcpInput(mcpEntry, input);
      if (answer !== undefined) (mcpAnswers[mcpEntry.name] ??= {})[input.name] = answer;
    }
  let agents: ReadonlyArray<string> | undefined =
    options.agents.length > 0 ? options.agents : undefined;
  let detectedUniversalAgents: ReadonlyArray<string> = [];
  // Spec #37, User Story 57: a chosen Universal stands for the detected Universal Agents, also with -a.
  if (
    options.agents.length === 0 ||
    (mcpEntries.length > 0 && options.agents.includes("universal"))
  ) {
    const upstream = yield* Upstream;
    const detected = yield* upstream.detectAgents();
    detectedUniversalAgents = detected.agents
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
  const plan: InstallPlan = {
    skillEntries:
      selecting && options.selected.length === 0
        ? []
        : selectSkillEntries(skillset, names).skillEntries,
    mcpEntries,
    mcpAnswers,
    agents,
    ...(detectedUniversalAgents.length > 0 ? { detectedUniversalAgents } : {}),
    scope,
    mode,
  };
  if (yield* prompter.confirmPlan(plan)) return plan;
});
