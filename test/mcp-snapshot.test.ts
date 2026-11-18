import { assert, it } from "@effect/vitest";
import { Effect } from "effect";
import { launchChoices, snapshotRegistryEntry } from "../src/mcp-snapshot.ts";
import { packageArgv } from "../src/mcp-entry.ts";
import type { RegistryServer } from "../src/registry.ts";
import { OFFICIAL, githubServer } from "./registry-fixtures.ts";

const snapshot = (server: object, choice = 0, name = "srv") => {
  const registryServer = { name: "io.github.o/srv", version: "1.0.0", ...server } as RegistryServer;
  return snapshotRegistryEntry({
    registry: OFFICIAL,
    server: registryServer,
    choice: launchChoices(registryServer)[choice]!,
    name,
  });
};

const origin = { registry: OFFICIAL, name: "io.github.o/srv", version: "1.0.0" };
const stdio = { transport: { type: "stdio" } };

it.effect.each([
  {
    title: "pypi",
    pkg: { registryType: "pypi", identifier: "weather-mcp", version: "0.5.0", ...stdio },
    launch: {
      type: "package",
      registryType: "pypi",
      identifier: "weather-mcp",
      version: "0.5.0",
      transport: "stdio",
    },
  },
  {
    title: "pypi with a runtime hint and package arguments",
    pkg: {
      registryType: "pypi",
      identifier: "x",
      version: "1.0.0",
      runtimeHint: "uvx",
      packageArguments: [{ type: "positional", value: "mcp" }],
      ...stdio,
    },
    launch: {
      type: "package",
      registryType: "pypi",
      identifier: "x",
      version: "1.0.0",
      runtimeHint: "uvx",
      packageArguments: ["mcp"],
      transport: "stdio",
    },
  },
  {
    title: "nuget confirms the download and passes package arguments after --",
    pkg: {
      registryType: "nuget",
      identifier: "Knapcode.SampleMcpServer",
      version: "0.4.0-beta",
      packageArguments: [
        { type: "positional", value: "mcp" },
        { type: "positional", value: "start" },
      ],
      ...stdio,
    },
    launch: {
      type: "package",
      registryType: "nuget",
      identifier: "Knapcode.SampleMcpServer",
      version: "0.4.0-beta",
      packageArguments: ["--yes", "--", "mcp", "start"],
      transport: "stdio",
    },
  },
  {
    title: "nuget without package arguments",
    pkg: { registryType: "nuget", identifier: "A.B", version: "1.0.0", ...stdio },
    launch: {
      type: "package",
      registryType: "nuget",
      identifier: "A.B",
      version: "1.0.0",
      packageArguments: ["--yes"],
      transport: "stdio",
    },
  },
  {
    title: "oci takes its version from the tag",
    pkg: { registryType: "oci", identifier: "docker.io/mcp/fs:1.0.2", ...stdio },
    launch: {
      type: "package",
      registryType: "oci",
      identifier: "docker.io/mcp/fs:1.0.2",
      version: "1.0.2",
      transport: "stdio",
    },
  },
  {
    title: "oci takes its version from the digest",
    pkg: { registryType: "oci", identifier: "localhost:5000/fs@sha256:abc", ...stdio },
    launch: {
      type: "package",
      registryType: "oci",
      identifier: "localhost:5000/fs@sha256:abc",
      version: "sha256:abc",
      transport: "stdio",
    },
  },
])("snapshot of a $title package", ({ pkg, launch }) =>
  Effect.gen(function* () {
    const entry = yield* snapshot({ packages: [pkg] });
    assert.deepStrictEqual(entry, { name: "srv", launch, origin } as typeof entry);
  }),
);

it.effect("an oci package passes its environment variables on with -e and keeps the hint", () =>
  Effect.gen(function* () {
    const entry = yield* snapshot({
      packages: [
        {
          registryType: "oci",
          identifier: "docker.io/example/db:3.1.0",
          runtimeHint: "docker",
          runtimeArguments: [
            { type: "named", name: "--network", value: "host" },
            {
              type: "named",
              name: "-e",
              value: "DB_TYPE={db_type}",
              variables: { db_type: { choices: ["postgres", "mysql"], isRequired: true } },
            },
          ],
          packageArguments: [
            { type: "named", name: "--host", default: "localhost", isRequired: true },
          ],
          environmentVariables: [
            { name: "DB_PASSWORD", isRequired: true, isSecret: true },
            { name: "SSL_MODE", default: "prefer" },
          ],
          ...stdio,
        },
      ],
    });
    assert.deepStrictEqual(entry.launch, {
      type: "package",
      registryType: "oci",
      identifier: "docker.io/example/db:3.1.0",
      version: "3.1.0",
      runtimeHint: "docker",
      runtimeArguments: [
        "--network",
        "host",
        "-e",
        "DB_TYPE={db_type}",
        "-e",
        "DB_PASSWORD",
        "-e",
        "SSL_MODE",
      ],
      packageArguments: ["--host", "{host}"],
      transport: "stdio",
    });
    assert.deepStrictEqual(
      entry.inputs?.map((input) => input.name),
      ["db_type", "host", "DB_PASSWORD", "SSL_MODE"],
    );
  }),
);

it.effect.each([
  { type: "cargo", identifier: "widget-mcp", version: "0.3.0" },
  { type: "mcpb", identifier: "https://example.com/x.mcpb" },
  { type: "docker-compose", identifier: "x", version: "1" },
])("a $type package is rejected naming the alternatives", ({ type, identifier, version }) =>
  Effect.gen(function* () {
    const error = yield* Effect.flip(
      snapshot({ packages: [{ registryType: type, identifier, version, ...stdio }] }),
    );
    assert.strictEqual(
      error.message,
      `Package type "${type}" is not supported; choose a remote or a package of type npm, pypi, nuget, oci.`,
    );
  }),
);

it.effect.each([
  { identifier: "docker.io/mcp/fs" },
  { identifier: "docker.io/mcp/fs:latest" },
  { identifier: "localhost:5000/fs" },
])("an oci package without an exact tag ($identifier) is rejected", ({ identifier }) =>
  Effect.gen(function* () {
    const error = yield* Effect.flip(
      snapshot({ packages: [{ registryType: "oci", identifier, ...stdio }] }),
    );
    assert.include(error.message, "names no exact version");
  }),
);

it.effect("a remote keeps its URL template, variables and header declarations", () =>
  Effect.gen(function* () {
    const entry = yield* snapshot(
      {
        remotes: [
          {
            type: "sse",
            url: "https://{tenant}.example.com/sse",
            variables: { tenant: { description: "Tenant", isRequired: true } },
            headers: [
              {
                name: "X-API-Key",
                description: "Key",
                isRequired: true,
                isSecret: true,
              },
              { name: "X-Region", default: "us", choices: ["us", "eu"] },
              {
                name: "Authorization",
                value: "Bearer {token}",
                variables: { token: { isSecret: true } },
              },
              { name: "X-Client", value: "skillset" },
            ],
          },
        ],
      },
      0,
      "my-srv",
    );
    assert.deepStrictEqual(entry, {
      name: "my-srv",
      launch: {
        type: "remote",
        transport: "sse",
        url: "https://{tenant}.example.com/sse",
        headers: [
          { name: "X-API-Key", value: "{X-API-Key}" },
          { name: "X-Region", value: "{X-Region}" },
          { name: "Authorization", value: "Bearer {token}" },
          { name: "X-Client", value: "skillset" },
        ],
      },
      inputs: [
        { name: "tenant", kind: "variable", description: "Tenant", required: true },
        {
          name: "X-API-Key",
          kind: "variable",
          description: "Key",
          required: true,
          secret: true,
          env: "MY_SRV_X_API_KEY",
        },
        { name: "X-Region", kind: "variable", default: "us", choices: ["us", "eu"] },
        { name: "token", kind: "variable", secret: true, env: "MY_SRV_TOKEN" },
      ],
      origin,
    });
  }),
);

it.effect.each([
  { url: "http://example.com/mcp", message: "must start with https://" },
  { url: "{base}/mcp", message: "must start with https://" },
])("a remote at $url is rejected", ({ url, message }) =>
  Effect.gen(function* () {
    const error = yield* Effect.flip(snapshot({ remotes: [{ type: "streamable-http", url }] }));
    assert.include(error.message, message);
  }),
);

it.effect("an unknown remote transport is rejected", () =>
  Effect.gen(function* () {
    const error = yield* Effect.flip(
      snapshot({ remotes: [{ type: "websocket", url: "https://example.com" }] }),
    );
    assert.include(error.message, 'Remote transport "websocket" is not supported');
  }),
);

it.effect("the GitHub server gives the expected Entry for each choice", () =>
  Effect.gen(function* () {
    const server = { ...githubServer } as unknown as RegistryServer;
    const choices = launchChoices(server);
    assert.deepStrictEqual(
      choices.map(({ kind }) => kind),
      ["package", "remote"],
    );
    const origin = { registry: OFFICIAL, name: githubServer.name, version: "2.2.0" };
    const run = (choice: (typeof choices)[number]) =>
      snapshotRegistryEntry({ registry: OFFICIAL, server, choice, name: "github" });
    assert.deepStrictEqual(yield* run(choices[0]!), {
      name: "github",
      launch: {
        type: "package",
        registryType: "oci",
        identifier: "ghcr.io/github/github-mcp-server:2.2.0",
        version: "2.2.0",
        runtimeArguments: [
          "-p",
          "127.0.0.1:8085:8085",
          "-e",
          "GITHUB_OAUTH_CALLBACK_PORT=8085",
          "-e",
          "GITHUB_PERSONAL_ACCESS_TOKEN={token}",
        ],
        transport: "stdio",
      },
      inputs: [
        { name: "token", kind: "variable", format: "string", secret: true, env: "GITHUB_TOKEN" },
      ],
      origin,
    });
    assert.deepStrictEqual(yield* run(choices[1]!), {
      name: "github",
      launch: {
        type: "remote",
        transport: "streamable-http",
        url: "https://api.githubcopilot.com/mcp/",
        headers: [{ name: "Authorization", value: "{Authorization}" }],
      },
      inputs: [
        {
          name: "Authorization",
          kind: "variable",
          description: "Authorization header with authentication token (PAT or App token)",
          secret: true,
          env: "GITHUB_AUTHORIZATION",
        },
      ],
      origin,
    });
  }),
);

it.effect.each([
  {
    title: "docker hint keeps run -i --rm",
    pkg: { registryType: "oci", identifier: "h/i:1", runtimeHint: "docker", ...stdio },
    argv: ["docker", "run", "-i", "--rm", "h/i:1"],
  },
  {
    title: "an oci identifier without a tag is pinned to the reviewed version",
    pkg: { registryType: "oci", identifier: "h/i", version: "1.0.2", ...stdio },
    argv: ["docker", "run", "-i", "--rm", "h/i:1.0.2"],
  },
  {
    title: "an oci identifier without a digest is pinned to the reviewed digest",
    pkg: { registryType: "oci", identifier: "localhost:5000/i", version: "sha256:abc", ...stdio },
    argv: ["docker", "run", "-i", "--rm", "localhost:5000/i@sha256:abc"],
  },
  {
    title: "pypi runs through uvx",
    pkg: { registryType: "pypi", identifier: "p", version: "2.0", ...stdio },
    argv: ["uvx", "p==2.0"],
  },
  {
    title: "nuget runs through dnx with --yes",
    pkg: { registryType: "nuget", identifier: "N", version: "1.0.0", ...stdio },
    argv: ["dnx", "N@1.0.0", "--yes"],
  },
])("launch command: $title", ({ pkg, argv }) =>
  Effect.gen(function* () {
    const { launch } = yield* snapshot({ packages: [pkg] });
    assert.strictEqual(launch.type, "package");
    if (launch.type === "package") assert.deepStrictEqual(packageArgv(launch), argv);
  }),
);
