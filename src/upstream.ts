import { Context, Effect } from "effect";
import type { Scope } from "effect";
import { ambiguousTreeMessage, CliMessageError as UpstreamError } from "./errors.ts";
import type {
  AgentInfo,
  BaseOptions,
  DetectAgentsResult,
  InstallOptions,
  InstallResult,
  SkillSource,
} from "skills";

export { ambiguousTreeMessage, UpstreamError };

// Spec #1, Upstream service: this boundary represents Git and skills, not a Source.
export class Upstream extends Context.Service<
  Upstream,
  {
    readonly resolveCommit: (
      source: string,
      ref?: string,
      treeRefs?: ReadonlyArray<string>,
    ) => Effect.Effect<string, UpstreamError>;
    readonly listSkills: (
      source: string,
      commit: string,
    ) => Effect.Effect<ReadonlyArray<string>, UpstreamError>;
    // skills API: resolve with the Pin once; the caller's scope disposes the fetched source.
    readonly resolveSource: (
      source: string,
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
