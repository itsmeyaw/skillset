import { Console, Effect, Stdio } from "effect";
import { Command, Flag, Prompt } from "effect/cli";
import type { InstallMode } from "skills";
import { CliMessageError as InstallError, missingSkillsMessage } from "../errors.ts";
import { root } from "../root.ts";
import { readSkillset } from "../skillset-file.ts";
import type { Entry } from "../skillset-file.ts";
import { Upstream } from "../upstream.ts";

export { InstallError };

type InstallPlan = {
  readonly entries: ReadonlyArray<Entry>;
  readonly agents: ReadonlyArray<string> | undefined;
  readonly global: boolean;
  readonly mode: InstallMode;
};

// Spec #1, install: check all pinned sources before writing, and dispose them after execution.
const executeInstall = Effect.fn("executeInstall")(function* (plan: InstallPlan) {
  const upstream = yield* Upstream;
  yield* Effect.scoped(
    Effect.gen(function* () {
      // Spec #1, install: group by the complete Source and Pin pair.
      const groups = new Map<string, Array<Entry>>();
      for (const entry of plan.entries) {
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
    }),
  );
});

// Spec #1, install -y: omitted agents use skills add -y defaults, project scope, and auto mode.
export const install = Command.make(
  "install",
  {
    selected: Flag.String("skill").pipe(Flag.withAlias("s"), Flag.atLeast(0)),
    agents: Flag.String("agent").pipe(Flag.withAlias("a"), Flag.atLeast(0)),
    global: Flag.Boolean("global").pipe(Flag.withAlias("g"), Flag.withDefault(false)),
    copy: Flag.Boolean("copy").pipe(Flag.withDefault(false)),
    yes: Flag.Boolean("yes").pipe(Flag.withAlias("y"), Flag.withDefault(false)),
  },
  Effect.fn(function* ({ selected, agents, global, copy, yes }) {
    const { set } = yield* root;
    const skillset = yield* readSkillset(set);
    // Spec #1, install: an explicit selection must name Entries in the Skillset.
    const missing = selected.filter(
      (name) => !skillset.skills.some((entry) => entry.name === name),
    );
    if (missing.length > 0)
      return yield* new InstallError({
        message: `Skills not found in Skillset: ${missing.join(", ")}`,
      });
    // Spec #1, User Stories 37–39: confirm the plan only in an interactive terminal.
    const interactive = !yes && (yield* (yield* Stdio.Stdio).stdinIsTerminal);
    let names: ReadonlyArray<string> = selected;
    let targets: ReadonlyArray<string> | undefined = agents.length === 0 ? undefined : agents;
    let scope = global;
    let mode: InstallMode = copy ? "copy" : "auto";
    if (interactive) {
      // Spec #1, User Stories 33–36: explicit flags skip their corresponding prompts.
      if (selected.length === 0 && skillset.skills.length > 0) {
        names = yield* Prompt.MultiSelect({
          message: "Which skills?",
          choices: skillset.skills.map((entry) => ({
            title: entry.name,
            value: entry.name,
            selected: true,
          })),
          min: 1,
        });
      }
      if (agents.length === 0 && skillset.skills.length > 0) {
        const upstream = yield* Upstream;
        const supported = yield* upstream.getSupportedAgents;
        const detected = yield* upstream.detectAgents();
        if (supported.length === 0)
          return yield* new InstallError({ message: "No supported agents available" });
        targets = yield* Prompt.MultiSelect({
          message: "Which agents?",
          choices: supported.map((agent) => ({
            title: agent.name,
            value: agent.id,
            selected: detected.agents.some((found) => found.id === agent.id),
          })),
          min: 1,
        });
      }
      if (!global) {
        scope = yield* Prompt.Select({
          message: "Installation scope?",
          choices: [
            { title: "Project", value: false },
            { title: "Global", value: true },
          ],
        });
      }
      if (!copy) {
        mode = yield* Prompt.Select({
          message: "Installation mode?",
          choices: [
            { title: "Symlink", value: "symlink" as const },
            { title: "Copy", value: "copy" as const },
          ],
        });
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
        `Skills: ${plan.entries.map((entry) => `${entry.name} (${entry.source}@${entry.commit})`).join(", ")}\n` +
          `Agents: ${plan.agents?.join(", ") ?? "default"}\n` +
          `Scope: ${plan.global ? "global" : "project"}\nMode: ${plan.mode}`,
      );
      const proceed = yield* Prompt.Confirm({
        message: "Proceed with installation?",
        initial: true,
      });
      if (!proceed) return;
    }
    yield* executeInstall(plan);
  }),
).pipe(Command.withDescription("Install pinned Skillset Entries"));
