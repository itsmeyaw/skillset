import { Context, Effect } from "effect";
import { CliMessageError as UpstreamError } from "./errors.ts";
import type { InstallScope } from "./agents/agent.ts";
import type { SkillEntry } from "./skillset-file.ts";

export { UpstreamError };

export type SkillsAgent = {
  readonly id: string;
  readonly name: string;
  readonly universal: boolean;
};

export type InstallChoices = {
  readonly agents?: ReadonlyArray<string>;
  readonly scope: InstallScope;
  readonly mode: "auto" | "copy" | "symlink";
  // Isolates filesystem writes in adapter tests.
  readonly cwd?: string;
};

export type InstallOutcome = {
  readonly installed: ReadonlyArray<{ readonly skill: string; readonly agent: string }>;
  readonly skipped: ReadonlyArray<{
    readonly skill: string;
    readonly agent: string;
    readonly reason: string;
  }>;
  readonly failed: ReadonlyArray<{
    readonly skill: string;
    readonly agent: string;
    readonly message: string;
  }>;
};

export type UpstreamSession = {
  readonly list: (
    remote: string,
    commit: string,
  ) => Effect.Effect<
    ReadonlyArray<{ readonly name: string; readonly description: string }>,
    UpstreamError
  >;
  readonly install: (
    skillEntries: ReadonlyArray<SkillEntry>,
    choices: InstallChoices,
  ) => Effect.Effect<InstallOutcome, UpstreamError>;
};

// Spec #1, Upstream service: this boundary represents Git and skills, not a Source.
export class Upstream extends Context.Service<
  Upstream,
  {
    readonly withSession: <A, E, R>(
      use: (session: UpstreamSession) => Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E, R>;
    readonly resolveRefs: (
      remote: string,
      refs: ReadonlyArray<string | undefined>,
    ) => Effect.Effect<ReadonlyArray<string | undefined>, UpstreamError>;
    readonly detectAgents: (options?: {
      readonly cwd?: string;
    }) => Effect.Effect<{ readonly agents: ReadonlyArray<SkillsAgent> }, UpstreamError>;
    readonly getSupportedAgents: Effect.Effect<ReadonlyArray<SkillsAgent>, UpstreamError>;
  }
>()("skillset/Upstream") {}
