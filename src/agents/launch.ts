import { packageArgv } from "../mcp-entry.ts";
import type { InputValue, ResolvedMcp } from "../mcp-inputs.ts";

// What every Agent needs to start or reach a server, with inputs filled in.
export type Launch =
  | {
      readonly type: "stdio";
      readonly command: string;
      readonly args: ReadonlyArray<string>;
      readonly env: Readonly<Record<string, string>>;
    }
  | {
      readonly type: "remote";
      readonly transport: "streamable-http" | "sse";
      readonly url: string;
      readonly headers: Readonly<Record<string, string>>;
    };

// ADR 0008: `envRef` writes an env var reference in the Agent's own syntax.
export const toLaunch = (
  { entry, values }: ResolvedMcp,
  envRef: (name: string) => string,
): Launch => {
  const render = (value: InputValue | undefined) =>
    value === undefined ? "" : "literal" in value ? value.literal : envRef(value.envVar);
  // shortcut: an optional {var} with no value becomes an empty string, revisit if a server breaks on it.
  const fill = (text: string) =>
    text.replace(/\{([^{}]+)\}/gu, (match, name: string) =>
      name in values ? render(values[name]) : match,
    );
  const { launch } = entry;
  if (launch.type === "remote")
    return {
      type: "remote",
      transport: launch.transport,
      url: fill(launch.url),
      headers: Object.fromEntries(
        (launch.headers ?? []).map((header) => [header.name, fill(header.value)]),
      ),
    };
  const [command = "", ...args] =
    launch.type === "package" ? packageArgv(launch) : [launch.command, ...(launch.args ?? [])];
  const env: Record<string, string> = {};
  for (const input of entry.inputs ?? []) {
    const value = values[input.name];
    if (input.kind === "env" && value !== undefined) env[input.name] = render(value);
  }
  return { type: "stdio", command: fill(command), args: args.map(fill), env };
};
