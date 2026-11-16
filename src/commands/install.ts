import { Console, Effect, FileSystem, Option } from "effect";
import { Argument, Command, Flag, Prompt } from "effect/cli";
import type { InstallMode, SkillSource } from "skills";
import {
  CliMessageError as InstallError,
  emptySkillsetMessage,
  missingSkillsMessage,
} from "../errors.ts";
import { cancelOnQuit } from "../prompts/cancel.ts";
import { isInteractive } from "../prompts/interactive.ts";
import { searchMultiSelect } from "../prompts/search.ts";
import { root } from "../root.ts";
import { readSkillset } from "../skillset-file.ts";
import type { Entry, Skillset } from "../skillset-file.ts";
import { Upstream } from "../upstream.ts";
import { resolveSet, userDir } from "../user-skillset.ts";

export { InstallError };

type InstallPlan = {
  readonly entries: ReadonlyArray<Entry>;
  readonly agents: ReadonlyArray<string> | undefined;
  readonly global: boolean;
  readonly mode: InstallMode;
};

// Issue #11: check every Source before confirming or writing a Source-based install.
const checkSources = Effect.fn("checkSources")(function* (allEntries: ReadonlyArray<Entry>) {
  const upstream = yield* Upstream;
  // Spec #1, install: group by the complete Source and Pin pair.
  const groups = new Map<string, Array<Entry>>();
  for (const entry of allEntries) {
    const key = JSON.stringify([entry.source, entry.commit]);
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }
  const checked = [];
  for (const entries of groups.values()) {
    const first = entries[0];
    if (first === undefined) continue;
    const source = yield* upstream.resolveSource(first.source, first.commit);
    const missing = entries.filter(
      (entry) => !source.skills.some((skill) => skill.name === entry.name),
    );
    if (missing.length > 0)
      return yield* new InstallError({
        message: missingSkillsMessage(
          first.commit,
          missing.map((entry) => entry.name),
        ),
      });
    checked.push({ source, entries });
  }
  return checked;
});

// Spec #1, install: checked Sources remain scoped until all installs complete.
const executeInstall = Effect.fn("executeInstall")(function* (
  plan: InstallPlan,
  checked: ReadonlyArray<{ readonly source: SkillSource; readonly entries: ReadonlyArray<Entry> }>,
) {
  const upstream = yield* Upstream;
  for (const { source, entries } of checked) {
    const result = yield* upstream.install(source, {
      skills: entries.map((entry) => entry.name),
      agents: plan.agents,
      scope: plan.global ? "global" : "project",
      mode: plan.mode,
    });
    // Spec #1, User Story 41: stop on the first failed write without rollback.
    if (result.failed.length > 0)
      return yield* new InstallError({
        message: result.failed.map((failure) => failure.message).join("; "),
      });
  }
  yield* Console.log(`Installed ${plan.entries.map((entry) => entry.name).join(", ")}`);
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
  if (skillset.skills.length === 0) {
    yield* Console.log(emptySkillsetMessage);
    return;
  }
  // Spec #1, install: an explicit selection must name Entries in the Skillset.
  const missing = selected.filter((name) => !skillset.skills.some((entry) => entry.name === name));
  if (missing.length > 0)
    return yield* new InstallError({
      message: `Skills not found in Skillset: ${missing.join(", ")}`,
    });
  // Spec #1, User Stories 37–39: confirm the plan only in an interactive terminal.
  const interactive = yield* isInteractive(yes);
  let names: ReadonlyArray<string> = selected;
  let targets: ReadonlyArray<string> | undefined = agents.length === 0 ? undefined : agents;
  let scope = global;
  let mode: InstallMode = copy ? "copy" : "auto";
  if (interactive) {
    // Spec #1, User Stories 33–36: explicit flags skip their corresponding prompts.
    if (selected.length === 0 && skillset.skills.length > 0) {
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
    if (agents.length === 0 && skillset.skills.length > 0) {
      const upstream = yield* Upstream;
      const supported = yield* upstream.getSupportedAgents;
      const detected = yield* upstream.detectAgents();
      if (supported.length === 0)
        return yield* new InstallError({ message: "No supported agents available" });
      targets = yield* cancelOnQuit(
        searchMultiSelect({
          message: "Which agents?",
          choices: supported.map((agent) => ({
            title: agent.name,
            value: agent.id,
            selected: detected.agents.some((found) => found.id === agent.id),
          })),
          min: 1,
        }),
      );
    }
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
    entries:
      names.length === 0
        ? skillset.skills
        : skillset.skills.filter((entry) => names.includes(entry.name)),
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
  set: string,
  options: InstallOptions,
) {
  const plan = yield* buildInstallPlan(yield* readSkillset(set), options);
  if (!plan) return;
  yield* Effect.scoped(
    Effect.gen(function* () {
      yield* executeInstall(plan, yield* checkSources(plan.entries));
    }),
  );
});

// Spec #1, install -y: omitted agents use skills add -y defaults, project scope, and auto mode.
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
    const { set: setFlag } = yield* root;
    // ADR 0003: positional Skillset references cannot be combined with --set.
    if (Option.isSome(options.set) && Option.isSome(setFlag))
      return yield* new InstallError({
        message: `"${options.set.value}" is a Skillset reference; it cannot be combined with --set.`,
      });
    // ADR 0003: invalid positional references use the User Skillset directory in the error.
    const set = Option.isSome(options.set)
      ? yield* resolveSet(options.set).pipe(
          Effect.mapError(
            () =>
              new InstallError({ message: missingSet(Option.getOrThrow(options.set), userDir()) }),
          ),
        )
      : yield* resolveSet(setFlag);
    // Issue #22: only a missing positional file gets the Skillset-not-found message.
    if (Option.isSome(options.set)) {
      const fs = yield* FileSystem.FileSystem;
      const exists = yield* fs
        .exists(set)
        .pipe(
          Effect.mapError(
            (error) =>
              new InstallError({ message: `Cannot read Skillset file ${set}: ${error.message}` }),
          ),
        );
      if (!exists) return yield* new InstallError({ message: missingSet(options.set.value, set) });
    }
    return yield* installSkillset(set, options);
  }),
).pipe(Command.withDescription("Install pinned Skillset Entries"));

// ADR 0003: do not guess whether an invalid reference was a skill or Source.
const missingSet = (arg: string, location: string) =>
  `Cannot find Skillset "${arg}" in ${location}. To install a skill, use \`skillset add\`.`;
