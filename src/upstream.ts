import { Context, Effect, Schema } from "effect";
import type { Scope } from "effect";
import { CliError } from "effect/cli";
import type {
  AgentInfo,
  BaseOptions,
  DetectAgentsResult,
  InstallOptions,
  InstallResult,
  SkillSource,
} from "skills";

export class UpstreamError extends Schema.TaggedError<
  UpstreamError,
  { readonly brand: unique symbol }
>()("UpstreamError", {
  message: Schema.String,
}) {
  override get [CliError.userMessage]() {
    return this.message;
  }
}

// Spec #1, Upstream service: this is the single swappable boundary to git and skills.
export class Upstream extends Context.Service<
  Upstream,
  {
    readonly resolveCommit: (source: string, ref?: string) => Effect.Effect<string, UpstreamError>;
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
