import { Console, Effect, Option } from "effect";
import { Argument, Command, Flag, Prompt } from "effect/cli";
import { CliMessageError as InstallError, emptySkillsetMessage } from "../errors.ts";
import { cancelOnQuit } from "../prompts/cancel.ts";
import { isInteractive } from "../prompts/interactive.ts";
import { searchMultiSelect } from "../prompts/search.ts";
import type { Entry, Skillset } from "../skillset-file.ts";
import {
  isEmpty,
  openCommandSkillset,
  selectEntries,
  unknownNamesMessage,
} from "../skillset-store.ts";
import { Upstream, type Agent, type InstallChoices, type UpstreamSession } from "../upstream.ts";

type InstallPlan = {
  readonly entries: ReadonlyArray<Entry>;
  readonly agents: ReadonlyArray<string> | undefined;
  readonly global: boolean;
  readonly mode: InstallChoices["mode"];
};

// Spec #1, install: share the default agent selection across interactive and unattended installs.
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
  // Spec #1, install: one Universal choice represents agents sharing .agents/skills.
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

const executeInstall = Effect.fn("executeInstall")(function* (
  plan: InstallPlan,
  session: UpstreamSession,
) {
  const result = yield* session.install(plan.entries, {
    agents: plan.agents,
    scope: plan.global ? "global" : "project",
    mode: plan.mode,
  });
  const installed = new Set(result.installed.map((target) => target.skill));
  for (const target of result.skipped)
    yield* Console.log(`Skipped ${target.skill} for ${target.agent}: ${target.reason}`);
  const names = plan.entries
    .filter((entry) => installed.has(entry.name))
    .map((entry) => entry.name);
  if (names.length > 0) yield* Console.log(`Installed ${names.join(", ")}`);
  // Spec #1, User Story 41: stop on the first failed write without rollback.
  if (result.failed.length > 0)
    return yield* new InstallError({
      message: result.failed.map((failure) => failure.message).join("; "),
    });
});

// ADR 0003: confirm the plan before installing skills.
const buildInstallPlan = Effect.fn("buildInstallPlan")(function* (
  skillset: Skillset,
  {
    selected,
    agents,
    global,
    copy,
    yes,
  }: {
    readonly selected: ReadonlyArray<string>;
    readonly agents: ReadonlyArray<string>;
    readonly global: boolean;
    readonly copy: boolean;
    readonly yes: boolean;
  },
) {
  // Issue #15: an empty Skillset needs neither a plan nor prompts.
  if (isEmpty(skillset)) {
    yield* Console.log(emptySkillsetMessage);
    return;
  }
  // Spec #1, install: an explicit selection must name Entries in the Skillset.
  const { unknown } = selectEntries(skillset, selected);
  if (unknown.length > 0)
    return yield* new InstallError({
      message: unknownNamesMessage(unknown),
    });
  // Spec #1, User Stories 37–39: confirm the plan only in an interactive terminal.
  const interactive = yield* isInteractive(yes);
  let names: ReadonlyArray<string> = selected;
  let targets: ReadonlyArray<string> | undefined = agents.length === 0 ? undefined : agents;
  let scope = global;
  let mode: InstallChoices["mode"] = copy ? "copy" : "auto";
  // Spec #1, User Stories 33–36: explicit flags skip their corresponding prompts.
  if (interactive && selected.length === 0) {
    names = yield* cancelOnQuit(
      Prompt.MultiSelect({
        message: "Which skills?",
        choices: skillset.skills.map((entry) => ({
          title: entry.name,
          value: entry.name,
          selected: true,
        })),
        min: 1,
      }),
    );
  }
  // Spec #1, install: explicit agent IDs bypass the shared default selection.
  if (agents.length === 0) {
    const upstream = yield* Upstream;
    const supported = yield* upstream.getSupportedAgents;
    const detected = yield* upstream.detectAgents();
    const { defaults, choices } = agentChoices(supported, detected.agents);
    if (interactive) {
      if (supported.length === 0)
        return yield* new InstallError({ message: "No supported agents available" });
      targets = yield* cancelOnQuit(
        searchMultiSelect({
          message: "Which agents?",
          choices,
          min: 1,
        }),
      );
    } else {
      // Spec #1, install -y: with no default agent, let skills choose; an empty list installs nothing.
      targets = defaults.length === 0 ? undefined : defaults;
    }
  }
  if (interactive) {
    if (!global) {
      scope = yield* cancelOnQuit(
        Prompt.Select({
          message: "Installation scope?",
          choices: [
            { title: "Project", value: false },
            { title: "Global", value: true },
          ],
        }),
      );
    }
    if (!copy) {
      mode = yield* cancelOnQuit(
        Prompt.Select({
          message: "Installation mode?",
          choices: [
            { title: "Symlink", value: "symlink" as const },
            { title: "Copy", value: "copy" as const },
          ],
        }),
      );
    }
  }
  const plan: InstallPlan = {
    entries: selectEntries(skillset, names).entries,
    agents: targets,
    global: scope,
    mode,
  };
  if (interactive) {
    yield* Console.log(
      `Skills:\n${plan.entries.map((entry) => `  ${entry.name} (${entry.source}@${entry.commit})`).join(",\n")}\n` +
        `Agents: ${plan.agents?.join(", ") ?? "default"}\n` +
        `Scope: ${plan.global ? "global" : "project"}\nMode: ${plan.mode}`,
    );
    const proceed = yield* cancelOnQuit(
      Prompt.Confirm({
        message: "Proceed with installation?",
        initial: true,
      }),
    );
    if (!proceed) return;
  }
  return plan;
});

type InstallOptions = Parameters<typeof buildInstallPlan>[1];

// Issue #11: existing installs preflight after confirmation.
export const installSkillset = Effect.fn("installSkillset")(function* (
  skillset: Skillset,
  options: InstallOptions,
  session: UpstreamSession,
) {
  const plan = yield* buildInstallPlan(skillset, options);
  if (!plan) return;
  yield* executeInstall(plan, session);
});

// Spec #1, install -y: omitted agents use shared defaults, project scope, and auto mode.
export const install = Command.make(
  "install",
  {
    set: Argument.String("set").pipe(Argument.optional),
    selected: Flag.String("skill").pipe(Flag.withAlias("s"), Flag.atLeast(0)),
    agents: Flag.String("agent").pipe(Flag.withAlias("a"), Flag.atLeast(0)),
    global: Flag.Boolean("global").pipe(Flag.withAlias("g"), Flag.withDefault(false)),
    copy: Flag.Boolean("copy").pipe(Flag.withDefault(false)),
    yes: Flag.Boolean("yes").pipe(Flag.withAlias("y"), Flag.withDefault(false)),
  },
  Effect.fn(function* (options) {
    const store = yield* openCommandSkillset({
      positional: Option.getOrUndefined(options.set),
      missing: "fail",
      install: true,
    });
    const upstream = yield* Upstream;
    return yield* upstream.withSession((session) =>
      installSkillset(store.skillset, options, session),
    );
  }),
).pipe(Command.withDescription("Install pinned Skillset Entries"));
