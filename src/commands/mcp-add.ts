import { Console, Effect } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import { CliMessageError } from "../errors.ts";
import {
  ENV_NAME_PATTERN,
  HEADER_NAME_PATTERN,
  MCP_NAME_PATTERN,
  type McpEntry,
} from "../mcp-entry.ts";
import { addMcpEntry, openCommandSkillset } from "../skillset-store.ts";

const fail = (message: string) => Effect.fail(new CliMessageError({ message }));

// ADR 0008: --env and --header declare names; a value would be saved as a secret by accident.
const checkInputNames = (flag: string, names: ReadonlyArray<string>, pattern: RegExp) => {
  for (const name of names) {
    if (name.includes("="))
      return fail(
        `--${flag} takes a name, not NAME=value (got "${name}"); set the value in your environment.`,
      );
    if (!pattern.test(name)) return fail(`Invalid --${flag} name "${name}".`);
  }
  return Effect.void;
};

// Spec #37, User Stories 22-26: a manual server is a command or a URL plus declared input names.
export const mcpAdd = Command.make(
  "add",
  {
    name: Argument.String("name"),
    command: Argument.String("command").pipe(Argument.variadic()),
    url: Flag.String("url").pipe(Flag.optional),
    header: Flag.String("header").pipe(Flag.atLeast(0)),
    env: Flag.String("env").pipe(Flag.atLeast(0)),
  },
  Effect.fn(function* ({ name, command, url, header, env }) {
    if (!MCP_NAME_PATTERN.test(name))
      return yield* fail(
        `Invalid MCP server name "${name}": use letters, digits, '.', '_' and '-'.`,
      );
    yield* checkInputNames("env", env, ENV_NAME_PATTERN);
    yield* checkInputNames("header", header, HEADER_NAME_PATTERN);
    if (url._tag === "Some" && command.length > 0)
      return yield* fail("Use either a command after -- or --url, not both.");
    if (url._tag === "None" && command.length === 0)
      return yield* fail("Give a command after -- or --url <https-url>.");
    if (url._tag === "None" && header.length > 0) return yield* fail("--header requires --url.");
    if (url._tag === "Some" && !url.value.startsWith("https://"))
      return yield* fail("MCP server URLs must use HTTPS.");
    const inputs = [
      ...header.map((input) => ({
        name: input,
        kind: "variable" as const,
        required: true,
        secret: true,
      })),
      ...env.map((input) => ({ name: input, kind: "env" as const, required: true, secret: true })),
    ];
    const entry: McpEntry = {
      name,
      launch:
        url._tag === "Some"
          ? {
              type: "remote",
              transport: "streamable-http",
              url: url.value,
              ...(header.length > 0
                ? { headers: header.map((input) => ({ name: input, value: `{${input}}` })) }
                : {}),
            }
          : { type: "command", command: command[0]!, args: command.slice(1) },
      ...(inputs.length > 0 ? { inputs } : {}),
    };
    const store = yield* openCommandSkillset({ missing: "create" });
    yield* store.save(yield* addMcpEntry(store.skillset, entry));
    yield* Console.log(`Added ${name} to ${store.path}`);
  }),
).pipe(Command.withDescription("Add an MCP server by hand"));
