import { Context, type Effect, type FileSystem, type Path, type Terminal } from "effect";
import type { CliMessageError } from "../errors.ts";
import type { ResolvedMcp } from "../mcp-inputs.ts";

export type McpScope = "project" | "global";

// Issue #42: tests supply temporary directories instead of the real working and home directories.
export class AgentPaths extends Context.Service<
  AgentPaths,
  { readonly cwd: string; readonly home: string }
>()("skillset/AgentPaths") {}

export type McpOutcome = {
  readonly name: string;
  readonly file: string;
  // unchanged: an identical server was already there; kept: a different server was left in place.
  readonly status: "written" | "unchanged" | "kept";
};

export type McpConflict = {
  readonly name: string;
  readonly file: string;
  readonly existing: unknown;
  readonly next: unknown;
};

export type AgentRuntime = FileSystem.FileSystem | Path.Path | Terminal.Terminal;

export type McpInstallContext = {
  readonly scope: McpScope;
  readonly paths: { readonly cwd: string; readonly home: string };
  // ADR 0007: a different server of the same name is overwritten only with consent.
  readonly confirmOverwrite: (
    conflict: McpConflict,
  ) => Effect.Effect<boolean, CliMessageError, AgentRuntime>;
};

// ADR 0007: one module per Agent knows its files, key path, entry shape and env reference syntax.
export type Agent = {
  readonly id: string;
  readonly name: string;
  readonly installMcp: (
    servers: ReadonlyArray<ResolvedMcp>,
    context: McpInstallContext,
  ) => Effect.Effect<ReadonlyArray<McpOutcome>, CliMessageError, AgentRuntime>;
  // A warning shown after the Agent's configuration was changed in this scope.
  readonly warning?: (scope: McpScope) => string | undefined;
};
