import { Console, Effect } from "effect";
import { CliMessageError } from "./errors.ts";
import { installMcpEntries } from "./mcp-install.ts";
import { buildInstallPlan, type InstallPlan, type InstallPlanOptions } from "./install-plan.ts";
import type { Prompter } from "./prompts/prompter.ts";
import type { Skillset } from "./skillset-file.ts";
import type { UpstreamSession } from "./upstream.ts";

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
) {
  const skills =
    plan.skillEntries.length > 0
      ? yield* installSkills(plan, session).pipe(Effect.result)
      : undefined;
  const mcpFailures = yield* installMcpEntries(plan);
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
  if (plan) yield* executeInstall(plan, session);
});
