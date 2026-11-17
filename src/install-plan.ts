import { Console, Effect } from "effect";
import { CliMessageError, emptySkillsetMessage } from "./errors.ts";
import type { Prompter } from "./prompts/prompter.ts";
import type { Entry, Skillset } from "./skillset-file.ts";
import { isEmpty, selectEntries, unknownNamesMessage } from "./skillset-store.ts";
import { Upstream, type Agent, type InstallChoices } from "./upstream.ts";

export type InstallPlan = {
  readonly entries: ReadonlyArray<Entry>;
  readonly agents: ReadonlyArray<string> | undefined;
  readonly scope: InstallChoices["scope"];
  readonly mode: InstallChoices["mode"];
};

export type InstallPlanOptions = {
  readonly selected: ReadonlyArray<string>;
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
  if (isEmpty(skillset)) {
    yield* Console.log(emptySkillsetMessage);
    return;
  }
  const { unknown } = selectEntries(skillset, options.selected);
  if (unknown.length > 0)
    return yield* new CliMessageError({ message: unknownNamesMessage(unknown) });
  const names =
    options.selected.length > 0
      ? options.selected
      : yield* prompter.requiredSkills(
          skillset.skills.map((entry) => ({
            title: entry.name,
            value: entry.name,
            selected: true,
          })),
        );
  let agents: ReadonlyArray<string> | undefined =
    options.agents.length > 0 ? options.agents : undefined;
  if (options.agents.length === 0) {
    const upstream = yield* Upstream;
    const supported = yield* upstream.getSupportedAgents;
    const detected = yield* upstream.detectAgents();
    const { defaults, choices } = agentChoices(supported, detected.agents);
    agents = yield* prompter.agents(choices, defaults, supported.length > 0);
  }
  const plan: InstallPlan = {
    entries: selectEntries(skillset, names).entries,
    agents,
    scope: options.global ? "global" : yield* prompter.scope(),
    mode: options.copy ? "copy" : yield* prompter.mode(),
  };
  if (yield* prompter.confirmPlan(plan)) return plan;
});
