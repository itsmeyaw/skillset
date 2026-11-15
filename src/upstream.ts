import { Context, Effect, Schema } from "effect";
import { CliError } from "effect/cli";
import type { InstallOptions, InstallResult, SkillSource } from "skills";

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
    readonly install: (
      source: SkillSource,
      options: InstallOptions,
    ) => Effect.Effect<InstallResult, UpstreamError>;
  }
>()("skillset/Upstream") {}
