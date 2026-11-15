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

export { UpstreamError };

// Spec #1, Upstream service: this is the single swappable boundary to git and skills.
export const ambiguousTreeMessage =
  "Ambiguous tree URL; use owner/repo#<branch-with-slashes> and -s <skill>.";

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
