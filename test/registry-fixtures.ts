// Canned MCP Registry responses.
// Official: https://registry.modelcontextprotocol.io/openapi.yaml (/v0.1/servers/{serverName}/versions/{version}).
// GitHub: https://api.mcp.github.com/v0.1/servers (different names, extra pagination fields).
export const OFFICIAL = "https://registry.modelcontextprotocol.io";

const official = (status = "active", isLatest = true) => ({
  "io.modelcontextprotocol.registry/official": {
    status,
    statusChangedAt: "2026-01-01T00:00:00Z",
    publishedAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    isLatest,
  },
});

export const versionResponse = (server: object, status?: string, isLatest?: boolean) => ({
  server: {
    $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
    ...server,
  },
  _meta: official(status, isLatest),
});

export const npmServer = (version: string) => ({
  name: "io.github.owner/server",
  description: "A canned server.",
  version,
  repository: { url: "https://github.com/owner/server", source: "github" },
  packages: [
    {
      registryType: "npm",
      identifier: "@owner/server",
      version,
      runtimeHint: "npx",
      transport: { type: "stdio" },
      runtimeArguments: [{ type: "positional", value: "-y" }],
      packageArguments: [
        {
          type: "named",
          name: "--region",
          value: "{region}",
          variables: { region: { description: "Cloud region", default: "eu" } },
        },
        {
          type: "named",
          name: "--token",
          value: "{token}",
          isRequired: true,
          variables: { token: { description: "API token", isRequired: true, isSecret: true } },
        },
        {
          type: "positional",
          valueHint: "root_dir",
          isRequired: true,
          description: "Directory to serve",
        },
      ],
      environmentVariables: [
        { name: "API_KEY", description: "Key", isRequired: true, isSecret: true },
        { name: "LOG_LEVEL", default: "info", choices: ["info", "debug"] },
      ],
    },
  ],
});

// GitHub-style: no reverse-DNS prefix, extra publisher metadata, extra list fields, no status timestamps.
export const GITHUB = "https://api.mcp.github.com";
export const githubResponse = {
  server: {
    name: "acme/widget",
    title: "Widget",
    version: "1.0.0",
    _meta: { "io.modelcontextprotocol.registry/publisher-provided": { github: { stars: 5 } } },
    packages: [
      {
        registryType: "npm",
        identifier: "widget-mcp",
        version: "1.0.0",
        transport: { type: "stdio" },
      },
    ],
  },
  _meta: { "io.modelcontextprotocol.registry/official": { isLatest: true, status: "active" } },
  total: 896,
};

export const encodedName = "io.github.owner%2Fserver";
export const versionUrl = (version: string, registry = OFFICIAL) =>
  `${registry}/v0.1/servers/${encodedName}/versions/${version}`;

// A fetch that answers canned URLs and records every request; any other URL is a 404.
export const cannedFetch = (
  routes: Readonly<Record<string, Response | (() => Response)>>,
  requested: Array<string> = [],
): typeof fetch =>
  (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    requested.push(url);
    const route = routes[url];
    if (route === undefined) return new Response("not found", { status: 404 });
    return typeof route === "function" ? route() : route.clone();
  }) as typeof fetch;

export const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), init);
