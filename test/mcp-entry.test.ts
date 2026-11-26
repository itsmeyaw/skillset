import { NodeFileSystem } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import type { McpEntry } from "../src/mcp-entry.ts";
import { readSkillset, SCHEMA_URL, writeSkillset } from "../src/skillset-file.ts";

const packageEntry: McpEntry = {
  name: "github",
  launch: {
    type: "package",
    registryType: "npm",
    identifier: "@modelcontextprotocol/server-github",
    version: "1.2.3",
    runtimeHint: "npx",
    runtimeArguments: ["-y"],
    packageArguments: ["--token", "{token}"],
    transport: "stdio",
  },
  inputs: [
    {
      name: "token",
      kind: "variable",
      description: "GitHub token",
      required: true,
      secret: true,
      env: "GITHUB_TOKEN",
    },
    {
      name: "LOG_LEVEL",
      kind: "env",
      format: "string",
      default: "info",
      choices: ["info", "debug"],
    },
  ],
  origin: {
    registry: "https://registry.modelcontextprotocol.io",
    name: "io.github.owner/github",
    version: "1.2.3",
  },
};
const remoteEntry: McpEntry = {
  name: "docs",
  launch: {
    type: "remote",
    transport: "streamable-http",
    url: "https://mcp.example.com/{tenant}/mcp",
    headers: [{ name: "Authorization", value: "Bearer {token}" }],
  },
  inputs: [
    { name: "tenant", kind: "variable", default: "acme" },
    { name: "token", kind: "variable", secret: true, env: "DOCS_TOKEN" },
  ],
};
const commandEntry: McpEntry = {
  name: "alpha",
  launch: { type: "command", command: "node", args: ["server.js", "--stdio"] },
};

const withFile = <E>(
  content: unknown,
  use: (path: string) => Effect.Effect<void, E, FileSystem.FileSystem>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const path = `${dir}/skillset.json`;
    yield* fs.writeFileString(path, JSON.stringify(content));
    yield* use(path);
  }).pipe(Effect.provide(NodeFileSystem.layer));

it.effect("a valid mcp array loads and round-trips through save sorted by name", () =>
  withFile(
    { $schema: SCHEMA_URL, skills: [], mcp: [packageEntry, remoteEntry, commandEntry] },
    (path) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const loaded = yield* readSkillset(path);
        assert.deepStrictEqual(loaded.mcp, [packageEntry, remoteEntry, commandEntry]);
        yield* writeSkillset(path, loaded, yield* fs.readFileString(path));
        assert.strictEqual(
          yield* fs.readFileString(path),
          JSON.stringify(
            { $schema: SCHEMA_URL, skills: [], mcp: [commandEntry, remoteEntry, packageEntry] },
            null,
            2,
          ) + "\n",
        );
      }).pipe(Effect.provide(NodeFileSystem.layer)),
  ),
);

it.effect("a Skillset without MCP Entries is written without an mcp key", () =>
  withFile({ $schema: SCHEMA_URL, skills: [], mcp: [] }, (path) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* writeSkillset(path, yield* readSkillset(path), yield* fs.readFileString(path));
      assert.strictEqual(
        yield* fs.readFileString(path),
        JSON.stringify({ $schema: SCHEMA_URL, skills: [] }, null, 2) + "\n",
      );
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  ),
);

const invalid = (description: string, mcp: unknown, message: RegExp) =>
  it.effect(`readSkillset rejects ${description}`, () =>
    withFile({ $schema: SCHEMA_URL, skills: [], mcp }, (path) =>
      Effect.gen(function* () {
        const error = yield* readSkillset(path).pipe(Effect.flip);
        assert.match(error.message, /Invalid Skillset file/);
        assert.match(error.message, message);
      }),
    ),
  );

const withLaunch = (launch: unknown, extra: object = {}) => [{ name: "x", launch, ...extra }];
const command = { type: "command", command: "node" };

invalid("a bad name", [{ ...commandEntry, name: "bad name" }], /\["mcp"\]\[0\]\["name"\]/);
invalid("a duplicate name", [commandEntry, commandEntry], /Duplicate MCP name "alpha"/);
invalid(
  "a non-https remote URL",
  withLaunch({ type: "remote", transport: "sse", url: "http://example.com/mcp" }),
  /launch.*url|https/,
);
invalid(
  "a control character in a command",
  withLaunch({ type: "command", command: "node\u001b[31m" }),
  /command/,
);
invalid(
  "an unknown package type",
  withLaunch({ ...packageEntry.launch, registryType: "cargo" }),
  /registryType|cargo/,
);
for (const version of ["^1.0.0", "latest", "next", "stable", "1.x", "1.2.X", "*", ">=1", "1 - 2"])
  invalid(
    `a moving package version ${JSON.stringify(version)}`,
    withLaunch({ ...packageEntry.launch, version }),
    /exact version/,
  );

for (const version of [
  "1.2.3",
  "1.0.0-beta.1",
  "1.2.3+build.5",
  "2.0.0rc1",
  "1!2.0.post1",
  "v1.2.3",
  `sha256:${"ab12".repeat(16)}`,
])
  it.effect(`readSkillset accepts the exact package version ${version}`, () =>
    withFile(
      {
        $schema: SCHEMA_URL,
        skills: [],
        mcp: withLaunch({ ...packageEntry.launch, version }),
      },
      (path) => readSkillset(path).pipe(Effect.asVoid),
    ),
  );
invalid(
  "a literal token in arguments",
  withLaunch({ type: "command", command: "node", args: ["--token", `ghp_${"a".repeat(36)}`] }),
  /literal secret.*args|args.*literal secret/s,
);
invalid(
  "a literal Authorization header",
  withLaunch({
    type: "remote",
    transport: "streamable-http",
    url: "https://example.com/mcp",
    headers: [{ name: "Authorization", value: "Bearer abcdef123456" }],
  }),
  /literal secret/,
);
invalid(
  "a default on a secret input",
  withLaunch(command, { inputs: [{ name: "KEY", kind: "env", secret: true, default: "hunter2" }] }),
  /secret input cannot have a default/,
);
invalid("an unknown field", withLaunch(command, { shell: "node x.js" }), /shell/);
