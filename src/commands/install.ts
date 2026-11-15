import { Effect, Schema } from "effect";
import { CliError, Command, Flag } from "effect/cli";
import type { InstallMode } from "skills";
import { root } from "../root.ts";
import { readSkillset } from "../skillset-file.ts";
import type { Entry } from "../skillset-file.ts";
import { Upstream } from "../upstream.ts";

export class InstallError extends Schema.TaggedError<
  InstallError,
  { readonly brand: unique symbol }
>()("InstallError", { message: Schema.String }) {
  override get [CliError.userMessage]() {
    return this.message;
  }
}

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
            message: `Skills not found at ${first.commit}: ${missing.map((entry) => entry.name).join(", ")}`,
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
  Effect.fn(function* ({ selected, agents, global, copy }) {
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
    yield* executeInstall({
      entries:
        selected.length === 0
          ? skillset.skills
          : skillset.skills.filter((entry) => selected.includes(entry.name)),
      agents: agents.length === 0 ? undefined : agents,
      global,
      mode: copy ? "copy" : "auto",
    });
  }),
).pipe(Command.withDescription("Install pinned Skillset Entries"));
