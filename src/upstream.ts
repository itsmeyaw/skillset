import { Context, Effect } from "effect";
import type { Scope } from "effect";
import { CliMessageError as UpstreamError } from "./errors.ts";
import type {
  AgentInfo,
  BaseOptions,
  DetectAgentsResult,
  InstallOptions,
  InstallResult,
  SkillSource,
} from "skills";
import type { Entry } from "./skillset-file.ts";

export { UpstreamError };

export type Agent = {
  readonly id: string;
  readonly name: string;
  readonly universal: boolean;
};

export type InstallChoices = {
  readonly agents?: ReadonlyArray<string>;
  readonly scope: "project" | "global";
  readonly mode: "auto" | "copy" | "symlink";
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
    entries: ReadonlyArray<Entry>,
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
    // skills API: resolve with the Pin once; the caller's scope disposes the fetched source.
    readonly resolveSource: (
      remote: string,
      commit: string,
    ) => Effect.Effect<SkillSource, UpstreamError, Scope.Scope>;
    readonly install: (
      source: SkillSource,
      options: Omit<InstallOptions, "ref">,
    ) => Effect.Effect<InstallResult, UpstreamError>;
    readonly detectAgents: (
      options?: BaseOptions,
    ) => Effect.Effect<DetectAgentsResult, UpstreamError>;
    readonly getSupportedAgents: Effect.Effect<ReadonlyArray<AgentInfo>, UpstreamError>;
  }
>()("skillset/Upstream") {}
