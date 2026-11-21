import { Console, Effect, type Option } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import { agents as agentsFlag } from "../agent-flag.ts";
import { CliMessageError } from "../errors.ts";
import { installSkillset } from "../install.ts";
import {
  ENV_NAME_PATTERN,
  HEADER_NAME_PATTERN,
  MCP_NAME_PATTERN,
  type McpEntry,
} from "../mcp-entry.ts";
import { launchChoices, defaultEntryName, snapshotRegistryEntry } from "../mcp-snapshot.ts";
import { makePrompter, type Prompter } from "../prompts/prompter.ts";
import {
  getServerVersion,
  listServers,
  refuseInactive,
  registryBase,
  type RegistryServer,
} from "../registry.ts";
import { addMcpEntry, openCommandSkillset } from "../skillset-store.ts";
import { Upstream } from "../upstream.ts";

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

const invalidName = (name: string) =>
  fail(`Invalid MCP server name "${name}": use letters, digits, '.', '_' and '-'.`);

const MIN_SEARCH_LENGTH = 3;

const usage = "Usage: skillset mcp add <registry-name>[@version] (a search needs a terminal)";

const describeChoice = (choice: ReturnType<typeof launchChoices>[number]) =>
  choice.kind === "package"
    ? `${choice.package.registryType} ${choice.package.identifier}`
    : `${choice.remote.type} ${choice.remote.url}`;

// Spec #37, User Stories 11-13: search latest active versions, paging on request.
const searchRegistry = (base: string, prompter: Prompter) =>
  Effect.gen(function* () {
    const answer = yield* prompter.searchTerm();
    if (answer === undefined) return yield* fail(usage);
    const term = answer.trim();
    if (Array.from(term).length < MIN_SEARCH_LENGTH)
      return yield* fail(`Search term must be at least ${MIN_SEARCH_LENGTH} characters.`);
    const found: Array<RegistryServer> = [];
    let cursor: string | undefined;
    for (;;) {
      const next = yield* listServers(base, { search: term, cursor });
      found.push(
        ...next.servers.filter(({ status }) => status === "active").map(({ server }) => server),
      );
      cursor = next.nextCursor;
      if (found.length === 0 && cursor === undefined)
        return yield* fail(`No servers match "${term}" in Registry ${base}.`);
      // A page of inactive servers shows nothing to pick, so keep paging.
      if (found.length === 0) continue;
      const names = found.map((server) => server.name);
      const chosen = yield* prompter.registryServer(names, cursor !== undefined);
      if (chosen !== undefined) return found[names.indexOf(chosen)]!;
    }
  });

// Spec #37, User Stories 1-4, 11-13 and 16-18: add the snapshot of one Registry server version.
const addFromRegistry = (
  given: string | undefined,
  registry: string | undefined,
  entryName: string | undefined,
  prompter: Prompter,
) =>
  Effect.gen(function* () {
    const store = yield* openCommandSkillset({ missing: "create" });
    const base = yield* registryBase(registry);
    const server =
      given === undefined
        ? yield* searchRegistry(base, prompter)
        : yield* Effect.gen(function* () {
            const at = given.lastIndexOf("@");
            const serverName = at > 0 ? given.slice(0, at) : given;
            const version = at > 0 ? given.slice(at + 1) : "latest";
            if (version === "") return yield* fail(`Missing version after "@" in "${given}".`);
            return yield* getServerVersion(base, serverName, version).pipe(
              Effect.flatMap((found) => refuseInactive(base, found)),
            );
          });
    const choices = launchChoices(server);
    if (choices.length === 0)
      return yield* fail(`${server.name} ${server.version} offers no package or remote.`);
    const choice =
      choices[
        choices.length === 1 ? 0 : yield* prompter.launchChoice(choices.map(describeChoice))
      ]!;
    const name = entryName ?? defaultEntryName(server.name);
    if (!MCP_NAME_PATTERN.test(name)) return yield* invalidName(name);
    const entry = yield* snapshotRegistryEntry({ registry: base, server, choice, name });
    const saved = yield* store.save(yield* addMcpEntry(store.skillset, entry));
    yield* Console.log(`Added ${name} to ${store.path}`);
    return saved;
  });

// Spec #37, User Stories 22-26: a manual server is a command or a URL plus declared input names.
export const mcpAdd = Command.make(
  "add",
  {
    name: Argument.String("name").pipe(Argument.optional),
    command: Argument.String("command").pipe(Argument.variadic()),
    url: Flag.String("url").pipe(Flag.optional),
    header: Flag.String("header").pipe(Flag.atLeast(0)),
    env: Flag.String("env").pipe(Flag.atLeast(0)),
    registry: Flag.String("registry").pipe(Flag.optional),
    entryName: Flag.String("name").pipe(Flag.optional),
    install: Flag.Boolean("install").pipe(Flag.withDefault(false)),
    agents: agentsFlag(),
    global: Flag.Boolean("global").pipe(Flag.withAlias("g"), Flag.withDefault(false)),
    copy: Flag.Boolean("copy").pipe(Flag.withDefault(false)),
    yes: Flag.Boolean("yes").pipe(Flag.withAlias("y"), Flag.withDefault(false)),
  },
  Effect.fn(function* (options) {
    const { install, agents, global, copy, yes } = options;
    // ADR 0003: install options are meaningful only when --install chains an install.
    if (!install && (agents.length > 0 || global || copy))
      return yield* fail("--agent, --global and --copy require --install.");
    const saved = yield* addEntry(options);
    // ADR 0003: the Entry is already written, so a declined or failed install keeps it.
    if (install) {
      const upstream = yield* Upstream;
      const prompter = yield* makePrompter(yes);
      yield* upstream.withSession((session) =>
        installSkillset(
          saved,
          { selected: [], selectedMcp: [], agents, global, copy },
          session,
          prompter,
        ),
      );
    }
  }),
).pipe(Command.withDescription("Add an MCP server from a Registry or by hand"));

const addEntry = Effect.fn(function* ({
  name: given,
  command,
  url,
  header,
  env,
  registry,
  entryName,
  yes,
}: {
  readonly name: Option.Option<string>;
  readonly command: ReadonlyArray<string>;
  readonly url: Option.Option<string>;
  readonly header: ReadonlyArray<string>;
  readonly env: ReadonlyArray<string>;
  readonly registry: Option.Option<string>;
  readonly entryName: Option.Option<string>;
  readonly yes: boolean;
}) {
  if (url._tag === "None" && command.length === 0) {
    if (header.length > 0 || env.length > 0)
      return yield* fail("--env and --header declare inputs of a manual server.");
    return yield* addFromRegistry(
      given._tag === "Some" ? given.value : undefined,
      registry._tag === "Some" ? registry.value : undefined,
      entryName._tag === "Some" ? entryName.value : undefined,
      yield* makePrompter(yes),
    );
  }
  if (given._tag === "None") return yield* fail("A manual server needs a name: mcp add <name> ...");
  const name = given.value;
  if (registry._tag === "Some" || entryName._tag === "Some")
    return yield* fail("--registry and --name apply to servers added from a Registry.");
  if (!MCP_NAME_PATTERN.test(name)) return yield* invalidName(name);
  yield* checkInputNames("env", env, ENV_NAME_PATTERN);
  yield* checkInputNames("header", header, HEADER_NAME_PATTERN);
  if (url._tag === "Some" && command.length > 0)
    return yield* fail("Use either a command after -- or --url, not both.");
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
  const saved = yield* store.save(yield* addMcpEntry(store.skillset, entry));
  yield* Console.log(`Added ${name} to ${store.path}`);
  return saved;
});
