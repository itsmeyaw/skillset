import { Context, type Effect, type FileSystem, type Path, type Terminal } from "effect";
import type { CliMessageError } from "../errors.ts";
import type { ResolvedMcp } from "../mcp-inputs.ts";
import type { Env } from "../user-skillset.ts";

export type InstallScope = "project" | "global";

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
  readonly scope: InstallScope;
  readonly paths: { readonly cwd: string; readonly home: string };
  readonly env: Env;
  // ADR 0007: a different server of the same name is overwritten only with consent.
  readonly confirmOverwrite: (
    conflict: McpConflict,
  ) => Effect.Effect<boolean, CliMessageError, AgentRuntime>;
};

// ADR 0007: an Agent is data: where its MCP file is, which table holds the servers, how one server looks.
// `writeAgentMcp` does the rest for every Agent.
export type Agent = {
  readonly id: string;
  readonly name: string;
  // Agents that resolve to the same file are written once, by the first of them, so their entries must be identical.
  readonly file: (
    scope: InstallScope,
    context: Pick<McpInstallContext, "paths" | "env">,
  ) => Effect.Effect<string, never, FileSystem.FileSystem>;
  // A function chooses the table from the file's content, for Agents with more than one layout.
  readonly keyPath:
    | ReadonlyArray<string>
    | ((root: Record<string, unknown>) => ReadonlyArray<string>);
  readonly entry: (resolved: ResolvedMcp, scope: InstallScope) => unknown;
  // A warning shown after the Agent's configuration was changed in this scope.
  readonly warning?: (scope: InstallScope) => string | undefined;
};
