import { NodeFileSystem } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import { listServers } from "../src/registry.ts";
import { RemoteFetch } from "../src/remote-skillset.ts";
import { runCli } from "./harness.ts";
import {
  GITHUB,
  OFFICIAL,
  cannedFetch,
  githubResponse,
  githubServer,
  json,
  npmServer,
  versionResponse,
  versionUrl,
} from "./registry-fixtures.ts";

const schemaUrl =
  "https://raw.githubusercontent.com/itsmeyaw/skillset/main/schemas/skillset/v1.json";

const setup = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const dir = yield* fs.makeTempDirectoryScoped();
  const file = `${dir}/set.json`;
  yield* fs.writeFileString(file, JSON.stringify({ $schema: schemaUrl, skills: [] }));
  return { fs, file, read: fs.readFileString(file).pipe(Effect.map((text) => JSON.parse(text))) };
});

const latest = versionResponse(npmServer("2.0.0"));
const name = "io.github.owner/server";

const expected = (version: string, registry = OFFICIAL) => ({
  name: "server",
  launch: {
    type: "package",
    registryType: "npm",
    identifier: "@owner/server",
    version,
    runtimeHint: "npx",
    runtimeArguments: ["-y"],
    packageArguments: ["--region", "{region}", "--token", "{token}", "{root_dir}"],
    transport: "stdio",
  },
  inputs: [
    { name: "region", kind: "variable", description: "Cloud region", default: "eu" },
    {
      name: "token",
      kind: "variable",
      description: "API token",
      required: true,
      secret: true,
      env: "SERVER_TOKEN",
    },
    { name: "root_dir", kind: "variable", description: "Directory to serve", required: true },
    { name: "API_KEY", kind: "env", description: "Key", required: true, secret: true },
    { name: "LOG_LEVEL", kind: "env", default: "info", choices: ["info", "debug"] },
  ],
  origin: { registry, name, version },
});

it.effect("mcp add stores the latest official npm server as a snapshot", () =>
  Effect.gen(function* () {
    const { file, read } = yield* setup;
    const requested: Array<string> = [];
    const fetch = cannedFetch({ [versionUrl("latest")]: json(latest) }, requested);
    const result = yield* runCli(["mcp", "add", name, "--set", file], { fetch });
    assert.deepStrictEqual(result.err, []);
    assert.strictEqual(result.code, 0);
    assert.include(result.out.join("\n"), `Added server to ${file}`);
    assert.deepStrictEqual(requested, [versionUrl("latest")]);
    assert.deepStrictEqual((yield* read).mcp, [expected("2.0.0")]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("mcp add name@version selects that version and --name overrides the Entry name", () =>
  Effect.gen(function* () {
    const { file, read } = yield* setup;
    const requested: Array<string> = [];
    const fetch = cannedFetch(
      { [versionUrl("1.0.0")]: json(versionResponse(npmServer("1.0.0"), "active", false)) },
      requested,
    );
    const result = yield* runCli(
      ["mcp", "add", `${name}@1.0.0`, "--name", "srv.v1", "--set", file],
      {
        fetch,
      },
    );
    assert.deepStrictEqual(result.err, []);
    assert.deepStrictEqual(requested, [versionUrl("1.0.0")]);
    const [entry] = (yield* read).mcp;
    assert.strictEqual(entry.name, "srv.v1");
    assert.deepStrictEqual(entry.origin, { registry: OFFICIAL, name, version: "1.0.0" });
    assert.strictEqual(entry.launch.version, "1.0.0");
    assert.strictEqual(entry.inputs[1].env, "SRV_V1_TOKEN");
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("mcp add --registry reads a differently shaped Registry and remembers it", () =>
  Effect.gen(function* () {
    const { file, read } = yield* setup;
    const requested: Array<string> = [];
    const url = `${GITHUB}/v0.1/servers/acme%2Fwidget/versions/latest`;
    const fetch = cannedFetch({ [url]: json(githubResponse) }, requested);
    const result = yield* runCli(
      ["mcp", "add", "acme/widget", "--registry", `${GITHUB}/`, "--set", file],
      { fetch },
    );
    assert.deepStrictEqual(result.err, []);
    assert.deepStrictEqual(requested, [url]);
    assert.deepStrictEqual((yield* read).mcp, [
      {
        name: "widget",
        launch: {
          type: "package",
          registryType: "npm",
          identifier: "widget-mcp",
          version: "1.0.0",
          transport: "stdio",
        },
        origin: { registry: GITHUB, name: "acme/widget", version: "1.0.0" },
      },
    ]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect.each([
  { registry: "http://registry.example", message: "HTTPS" },
  { registry: "registry.example", message: "HTTPS" },
  { registry: "https://user:pw@registry.example", message: "credentials" },
])("mcp add rejects --registry $registry without fetching", ({ registry, message }) =>
  Effect.gen(function* () {
    const { file, fs } = yield* setup;
    const before = yield* fs.readFileString(file);
    const result = yield* runCli(["mcp", "add", name, "--registry", registry, "--set", file]);
    assert.strictEqual(result.code, 1);
    assert.include(result.err.join("\n"), message);
    assert.strictEqual(yield* fs.readFileString(file), before);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

const huge = () => new Response("x".repeat(1024 * 1024 + 1));

it.effect.each([
  {
    title: "a deprecated version",
    response: () => json(versionResponse(npmServer("2.0.0"), "deprecated")),
    message: `${name} 2.0.0 is deprecated in Registry ${OFFICIAL}`,
  },
  {
    title: "a deleted version",
    response: () => json(versionResponse(npmServer("2.0.0"), "deleted")),
    message: `${name} 2.0.0 is deleted in Registry ${OFFICIAL}`,
  },
  {
    title: "404",
    response: () => new Response("{}", { status: 404 }),
    message: `Server ${name} not found in Registry ${OFFICIAL}`,
  },
  {
    title: "429",
    response: () => new Response("{}", { status: 429 }),
    message: `Registry ${OFFICIAL} is rate limiting requests`,
  },
  {
    title: "500",
    response: () => new Response("{}", { status: 500 }),
    message: `Cannot fetch from Registry ${OFFICIAL}: HTTP 500`,
  },
  {
    title: "invalid JSON",
    response: () => new Response("<html>"),
    message: `Registry ${OFFICIAL} returned an invalid response`,
  },
  {
    title: "an unexpected shape",
    response: () => json({ server: { name: 1 } }),
    message: `Registry ${OFFICIAL} returned an invalid response`,
  },
  {
    title: "an ESC in the server name",
    response: () => json(versionResponse({ ...npmServer("2.0.0"), name: "evil\u001b[2Jserver" })),
    message: `Registry ${OFFICIAL} returned an invalid response`,
  },
  {
    title: "an ESC in a package identifier",
    response: () =>
      json(
        versionResponse({
          ...npmServer("2.0.0"),
          packages: [
            {
              registryType: "npm",
              identifier: "x\u001b]0;pwn\u0007",
              transport: { type: "stdio" },
            },
          ],
        }),
      ),
    message: `Registry ${OFFICIAL} returned an invalid response`,
  },
  {
    title: "an ESC in a package argument type",
    response: () =>
      json(
        versionResponse({
          ...npmServer("2.0.0"),
          packages: [
            {
              registryType: "npm",
              identifier: "x",
              transport: { type: "stdio" },
              packageArguments: [{ type: "weird\u001b[2J", value: "v" }],
            },
          ],
        }),
      ),
    message: `Registry ${OFFICIAL} returned an invalid response`,
  },
  {
    title: "an ESC in an environment variable name",
    response: () =>
      json(
        versionResponse({
          ...npmServer("2.0.0"),
          packages: [
            {
              registryType: "npm",
              identifier: "x",
              transport: { type: "stdio" },
              environmentVariables: [{ name: "KEY\u001b[2J" }],
            },
          ],
        }),
      ),
    message: `Registry ${OFFICIAL} returned an invalid response`,
  },
  {
    title: "an ESC in a remote url",
    response: () =>
      json(
        versionResponse({
          ...npmServer("2.0.0"),
          packages: undefined,
          remotes: [{ type: "streamable-http", url: "https://x.example/\u001b[2J" }],
        }),
      ),
    message: `Registry ${OFFICIAL} returned an invalid response`,
  },
  {
    title: "an oversize body",
    response: huge,
    message: `Cannot fetch from Registry ${OFFICIAL}: Body exceeds 1 MB`,
  },
  {
    title: "a redirect to http",
    response: () =>
      new Response(null, { status: 302, headers: { location: "http://evil.example/" } }),
    message: "Redirects must use HTTPS",
  },
  {
    title: "a cargo package",
    response: () =>
      json(
        versionResponse({
          ...npmServer("2.0.0"),
          packages: [
            { registryType: "cargo", identifier: "x", version: "1", transport: { type: "stdio" } },
          ],
        }),
      ),
    message: 'Package type "cargo" is not supported; choose a remote or a package of type',
  },
])("mcp add fails on $title and leaves the file alone", ({ response, message }) =>
  Effect.gen(function* () {
    const { file, fs } = yield* setup;
    const before = yield* fs.readFileString(file);
    const fetch = cannedFetch({ [versionUrl("latest")]: response });
    const result = yield* runCli(["mcp", "add", name, "--set", file], { fetch });
    assert.strictEqual(result.code, 1);
    assert.include(result.err.join("\n"), message);
    assert.strictEqual(yield* fs.readFileString(file), before);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("mcp add refuses a duplicate Entry name", () =>
  Effect.gen(function* () {
    const { file, fs } = yield* setup;
    const fetch = cannedFetch({ [versionUrl("latest")]: json(latest) });
    yield* runCli(["mcp", "add", name, "--set", file], { fetch });
    const before = yield* fs.readFileString(file);
    const result = yield* runCli(["mcp", "add", name, "--set", file], { fetch });
    assert.strictEqual(result.code, 1);
    assert.include(result.err.join("\n"), "MCP server server already exists");
    assert.strictEqual(yield* fs.readFileString(file), before);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("a secret declaration is never downgraded by an earlier plain one", () =>
  Effect.gen(function* () {
    const { file, read } = yield* setup;
    const base = npmServer("2.0.0");
    const server = {
      ...base,
      packages: [
        {
          ...base.packages[0],
          packageArguments: [
            {
              type: "named",
              name: "--a",
              value: "{token}",
              variables: { token: { description: "Token", default: "hunter2" } },
            },
            {
              type: "named",
              name: "--b",
              value: "{token}",
              variables: { token: { isRequired: true, isSecret: true } },
            },
          ],
          environmentVariables: [],
        },
      ],
    };
    const result = yield* runCli(["mcp", "add", name, "--set", file], {
      fetch: cannedFetch({ [versionUrl("latest")]: json(versionResponse(server)) }),
    });
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual((yield* read).mcp[0].inputs, [
      {
        name: "token",
        kind: "variable",
        description: "Token",
        required: true,
        secret: true,
        env: "SERVER_TOKEN",
      },
    ]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("mcp add saves no secret value and ls and install need no Registry", () =>
  Effect.gen(function* () {
    const { file, fs } = yield* setup;
    const added = yield* runCli(["mcp", "add", name, "--set", file], {
      fetch: cannedFetch({ [versionUrl("latest")]: json(latest) }),
    });
    assert.strictEqual(added.code, 0);
    const text = yield* fs.readFileString(file);
    assert.include(text, '"env": "SERVER_TOKEN"');
    assert.notInclude(text, "ghp_");
    const listed = yield* runCli(["ls", "--set", file]);
    assert.include(listed.out.join("\n"), "server  registry  npx -y @owner/server@2.0.0");
    const cwd = yield* fs.makeTempDirectoryScoped();
    const installed = yield* runCli(["install", "--set", file, "-y", "-a", "claude-code"], { cwd });
    assert.strictEqual(installed.code, 0);
    const config = JSON.parse(yield* fs.readFileString(`${cwd}/.mcp.json`));
    assert.deepStrictEqual(config.mcpServers.server, {
      type: "stdio",
      command: "npx",
      args: [
        "-y",
        "@owner/server@2.0.0",
        "--region",
        "eu",
        "--token",
        "${SERVER_TOKEN}",
        "${SERVER_ROOT_DIR}",
      ],
      env: { API_KEY: "${API_KEY}", LOG_LEVEL: "info" },
    });
    assert.include(installed.out.join("\n"), "SERVER_TOKEN");
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("the Registry client follows an opaque cursor unchanged", () =>
  Effect.gen(function* () {
    const requested: Array<string> = [];
    const cursor = "mcp.cursor.eyJ2Ijox/+=";
    const fetch = cannedFetch(
      {
        [`${GITHUB}/v0.1/servers?version=latest&search=wid&cursor=${encodeURIComponent(cursor)}`]:
          json({
            servers: [githubResponse],
            metadata: { nextCursor: null, count: 1, total_pages: 1 },
          }),
      },
      requested,
    );
    const page = yield* listServers(GITHUB, { search: "wid", cursor }).pipe(
      Effect.provideService(RemoteFetch, fetch),
    );
    assert.deepStrictEqual(
      page.servers.map((found) => found.server.name),
      ["acme/widget"],
    );
    assert.strictEqual(page.nextCursor, undefined);
  }),
);

const githubUrl = `${GITHUB}/v0.1/servers/io.github.github%2Fgithub-mcp-server/versions/latest`;

it.effect("mcp add takes the first choice of the GitHub server and install runs docker", () =>
  Effect.gen(function* () {
    const { file, fs, read } = yield* setup;
    const fetch = cannedFetch({ [githubUrl]: json(versionResponse(githubServer)) });
    const added = yield* runCli(
      ["mcp", "add", githubServer.name, "--registry", GITHUB, "--name", "github", "--set", file],
      { fetch },
    );
    assert.deepStrictEqual(added.err, []);
    const [entry] = (yield* read).mcp;
    assert.strictEqual(entry.launch.registryType, "oci");
    assert.deepStrictEqual(entry.inputs, [
      { name: "token", kind: "variable", format: "string", secret: true, env: "GITHUB_TOKEN" },
    ]);
    const cwd = yield* fs.makeTempDirectoryScoped();
    const installed = yield* runCli(["install", "--set", file, "-y", "-a", "claude-code"], { cwd });
    assert.strictEqual(installed.code, 0);
    const config = JSON.parse(yield* fs.readFileString(`${cwd}/.mcp.json`));
    assert.deepStrictEqual(config.mcpServers.github, {
      type: "stdio",
      command: "docker",
      args: [
        "run",
        "-i",
        "--rm",
        "-p",
        "127.0.0.1:8085:8085",
        "-e",
        "GITHUB_OAUTH_CALLBACK_PORT=8085",
        "-e",
        "GITHUB_PERSONAL_ACCESS_TOKEN=${GITHUB_TOKEN}",
        "ghcr.io/github/github-mcp-server:2.2.0",
      ],
    });
    assert.include(installed.out.join("\n"), "GITHUB_TOKEN");
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("mcp add stores a remote when the server offers only remotes", () =>
  Effect.gen(function* () {
    const { file, read } = yield* setup;
    const { packages: _packages, ...remoteOnly } = githubServer;
    const fetch = cannedFetch({ [githubUrl]: json(versionResponse(remoteOnly)) });
    const added = yield* runCli(
      ["mcp", "add", githubServer.name, "--registry", GITHUB, "--set", file],
      { fetch },
    );
    assert.deepStrictEqual(added.err, []);
    const [entry] = (yield* read).mcp;
    assert.deepStrictEqual(entry.launch, {
      type: "remote",
      transport: "streamable-http",
      url: "https://api.githubcopilot.com/mcp/",
      headers: [{ name: "Authorization", value: "{Authorization}" }],
    });
    assert.strictEqual(entry.inputs[0].env, "GITHUB_MCP_SERVER_AUTHORIZATION");
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);
