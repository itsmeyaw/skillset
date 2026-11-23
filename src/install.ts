import { Console, Effect } from "effect";
import { Flag } from "effect/cli";
import { agents } from "./agent-flag.ts";
import { CliMessageError } from "./errors.ts";
import { installMcpEntries } from "./mcp-install.ts";
import { buildInstallPlan, type InstallPlan, type InstallPlanOptions } from "./install-plan.ts";
import type { Prompter } from "./prompts/prompter.ts";
import type { Skillset } from "./skillset-file.ts";
import { Upstream, type UpstreamSession } from "./upstream.ts";

const installSkills = Effect.fn("installSkills")(function* (
  plan: InstallPlan,
  session: UpstreamSession,
) {
  const result = yield* session.install(plan.skillEntries, {
    agents: plan.agents,
    scope: plan.scope,
    mode: plan.mode,
  });
  const installed = new Set(result.installed.map((target) => target.skill));
  for (const target of result.skipped)
    yield* Console.log(`Skipped ${target.skill} for ${target.agent}: ${target.reason}`);
  const names = plan.skillEntries
    .filter((skillEntry) => installed.has(skillEntry.name))
    .map((skillEntry) => skillEntry.name);
  if (names.length > 0) yield* Console.log(`Installed ${names.join(", ")}`);
  // Spec #1, User Story 41: stop on the first failed write without rollback.
  if (result.failed.length > 0)
    return yield* new CliMessageError({
      message: result.failed.map((failure) => failure.message).join("; "),
    });
});

// ADR 0007: skills install through the batch skills install, MCP Entries through each Agent;
// one summary and one exit code cover both, and a failure in one kind does not block the other.
const executeInstall = Effect.fn("executeInstall")(function* (
  plan: InstallPlan,
  session: UpstreamSession,
  prompter: Prompter,
) {
  const skills =
    plan.skillEntries.length > 0
      ? yield* installSkills(plan, session).pipe(Effect.result)
      : undefined;
  const mcpFailures = yield* installMcpEntries(plan, prompter);
  if (skills?._tag === "Failure" && mcpFailures.length === 0) return yield* skills.failure;
  const failures = [
    ...(skills?._tag === "Failure" ? [skills.failure.message] : []),
    ...mcpFailures,
  ];
  if (failures.length > 0) return yield* new CliMessageError({ message: failures.join("; ") });
});

// Issue #11: existing installs preflight after confirmation.
export const installSkillset = Effect.fn("installSkillset")(function* (
  skillset: Skillset,
  options: InstallPlanOptions,
  session: UpstreamSession,
  prompter: Prompter,
) {
  const plan = yield* buildInstallPlan(skillset, options, prompter);
  if (plan) yield* executeInstall(plan, session, prompter);
});

// ADR 0003 and 0005: `install`, `skill add` and `mcp add` declare these flags once.
export const installFlags = (positional?: (value: string) => boolean) => ({
  agents: agents(positional),
  global: Flag.Boolean("global").pipe(Flag.withAlias("g"), Flag.withDefault(false)),
  copy: Flag.Boolean("copy").pipe(Flag.withDefault(false)),
  yes: Flag.Boolean("yes").pipe(Flag.withAlias("y"), Flag.withDefault(false)),
});

// The commands that edit a Skillset chain an install with this flag.
export const chainFlag = Flag.Boolean("install").pipe(Flag.withDefault(false));

type ChainFlags = {
  readonly install: boolean;
  readonly agents: ReadonlyArray<string>;
  readonly global: boolean;
  readonly copy: boolean;
};

// ADR 0003: install options are meaningful only when --install chains an install.
export const requireInstallForFlags = ({ install, agents, global, copy }: ChainFlags) =>
  !install && (agents.length > 0 || global || copy)
    ? Effect.fail(
        new CliMessageError({ message: "--agent, --global and --copy require --install." }),
      )
    : Effect.void;

// ADR 0003 and 0005: after an Entry is written, `--install` (or a "yes" to the prompt) installs the
// whole Skillset, so a declined or failed install keeps the Entry.
// A command that already holds an Upstream session (`skill add`, which used it for pinning) passes
// it so clones are shared; others pass none and the install opens its own.
export const chainInstall = Effect.fn("chainInstall")(function* (
  saved: Skillset,
  flags: ChainFlags,
  prompter: Prompter,
  session?: UpstreamSession,
) {
  if (!flags.install && !(yield* prompter.confirmInstall())) return;
  const run = (current: UpstreamSession) =>
    installSkillset(
      saved,
      {
        selected: [],
        selectedMcp: [],
        agents: flags.agents,
        global: flags.global,
        copy: flags.copy,
      },
      current,
      prompter,
    );
  if (session !== undefined) return yield* run(session);
  const upstream = yield* Upstream;
  return yield* upstream.withSession(run);
});
