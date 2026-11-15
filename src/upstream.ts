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

// git-ls-remote(1): multiple possible tree refs require an explicit branch.
export const ambiguousTreeMessage =
  "Ambiguous tree URL; use owner/repo#<branch-with-slashes> and -s <skill>.";

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
