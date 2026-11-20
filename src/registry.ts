import { Effect, Schema } from "effect";
import { HttpStatusError, fetchBoundedText } from "./bounded-fetch.ts";
import { entryText } from "./entry-text.ts";
import { CliMessageError } from "./errors.ts";
import { RemoteFetch } from "./remote-skillset.ts";

// Official Registry API: https://registry.modelcontextprotocol.io/openapi.yaml (stable /v0.1).
// server.json fields: https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/server-json/draft/server.schema.json
// GitHub's Registry (https://api.mcp.github.com) serves the same API with other names and extra fields.
export const OFFICIAL_REGISTRY = "https://registry.modelcontextprotocol.io";

// Names, versions, types, identifiers and URLs reach the terminal unfiltered, so they use entryText (no control characters).
// Spec #37, User Story 10: validate only the fields snapshots need and ignore the rest.
const optionalList = <S extends Schema.Constraint>(item: S) =>
  Schema.optional(Schema.NullOr(Schema.Array(item)));

const variable = Schema.Struct({
  description: Schema.optional(Schema.String),
  isRequired: Schema.optional(Schema.Boolean),
  isSecret: Schema.optional(Schema.Boolean),
  format: Schema.optional(Schema.String),
  default: Schema.optional(Schema.String),
  choices: optionalList(Schema.String),
});

// Arguments, environment variables and headers share these fields.
const registryInput = Schema.Struct({
  ...variable.fields,
  name: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
  value: Schema.optional(Schema.String),
  valueHint: Schema.optional(Schema.String),
  variables: Schema.optional(Schema.NullOr(Schema.Record(Schema.String, variable))),
});

const registryPackage = Schema.Struct({
  registryType: entryText,
  identifier: entryText,
  version: Schema.optional(Schema.String),
  runtimeHint: Schema.optional(Schema.String),
  transport: Schema.optional(Schema.Struct({ type: entryText })),
  runtimeArguments: optionalList(registryInput),
  packageArguments: optionalList(registryInput),
  environmentVariables: optionalList(registryInput),
});

const registryRemote = Schema.Struct({
  type: entryText,
  url: entryText,
  headers: optionalList(registryInput),
  variables: Schema.optional(Schema.NullOr(Schema.Record(Schema.String, variable))),
});

const registryServer = Schema.Struct({
  name: entryText,
  version: entryText,
  packages: optionalList(registryPackage),
  remotes: optionalList(registryRemote),
});

const serverResponse = Schema.Struct({
  server: registryServer,
  _meta: Schema.optional(
    Schema.Struct({
      "io.modelcontextprotocol.registry/official": Schema.optional(
        Schema.Struct({ status: Schema.optional(Schema.String) }),
      ),
    }),
  ),
});

const serverList = Schema.Struct({
  servers: Schema.optional(Schema.NullOr(Schema.Array(serverResponse))),
  metadata: Schema.optional(
    Schema.NullOr(Schema.Struct({ nextCursor: Schema.optional(Schema.NullOr(Schema.String)) })),
  ),
});

export type RegistryInput = typeof registryInput.Type;
export type RegistryVariable = typeof variable.Type;
export type RegistryPackage = typeof registryPackage.Type;
export type RegistryRemote = typeof registryRemote.Type;
export type RegistryServer = typeof registryServer.Type;
export type ServerVersion = {
  readonly server: RegistryServer;
  // A Registry without status metadata is taken as active.
  readonly status: "active" | "deprecated" | "deleted";
};

const toServerVersion = (response: typeof serverResponse.Type): ServerVersion => {
  const status = response._meta?.["io.modelcontextprotocol.registry/official"]?.status;
  return {
    server: response.server,
    status: status === "deprecated" || status === "deleted" ? status : "active",
  };
};

const fail = (message: string) => new CliMessageError({ message });

// Spec #37, User Story 9: Registry URLs use https; the CLI adds /v0.1 itself.
export const registryBase = (given: string = OFFICIAL_REGISTRY) => {
  const url = URL.canParse(given) ? new URL(given) : undefined;
  if (url === undefined || url.protocol !== "https:")
    return Effect.fail(fail("Registry URLs must use HTTPS."));
  if (url.username || url.password || url.search || url.hash)
    return Effect.fail(fail("Registry URLs must not contain credentials, a query or a fragment."));
  return Effect.succeed((url.origin + url.pathname).replace(/\/+$/u, ""));
};

// Spec #37, User Story 88: short messages name the Registry and never echo response bodies.
const getJson = <A>(
  base: string,
  path: string,
  decode: (text: string) => Effect.Effect<A, Schema.SchemaError>,
  notFound: string,
  rejected?: string,
) =>
  Effect.gen(function* () {
    const fetchRemote = yield* RemoteFetch;
    const text = yield* Effect.tryPromise({
      try: () => fetchBoundedText(new URL(`${base}/v0.1${path}`), fetchRemote),
      catch: (error) => {
        if (error instanceof HttpStatusError && error.status === 404)
          return fail(`${notFound} in Registry ${base}.`);
        if (error instanceof HttpStatusError && error.status === 422 && rejected !== undefined)
          return fail(`Registry ${base} rejected the request: ${rejected}`);
        if (error instanceof HttpStatusError && error.status === 429)
          return fail(`Registry ${base} is rate limiting requests (HTTP 429); try again later.`);
        return fail(
          `Cannot fetch from Registry ${base}: ${error instanceof Error ? error.message : String(error)}`,
        );
      },
    });
    return yield* decode(text).pipe(
      Effect.mapError(() => fail(`Registry ${base} returned an invalid response.`)),
    );
  });

// Spec #37, User Story 4: a deprecated or deleted version is not addable.
// shortcut: a deprecated "latest" is refused, not replaced by the newest active version; walk /versions when needed.
export const refuseInactive = (base: string, { server, status }: ServerVersion) =>
  status === "active"
    ? Effect.succeed(server)
    : Effect.fail(fail(`${server.name} ${server.version} is ${status} in Registry ${base}.`));

const decodeServerResponse = Schema.decodeEffect(Schema.fromJsonString(serverResponse));
const decodeServerList = Schema.decodeEffect(Schema.fromJsonString(serverList));

// version is an exact version or "latest"; names and versions are URL-encoded path segments.
export const getServerVersion = (base: string, name: string, version: string) =>
  getJson(
    base,
    `/servers/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}`,
    decodeServerResponse,
    version === "latest"
      ? `Server ${name} not found`
      : `Server ${name} version ${version} not found`,
  ).pipe(Effect.map(toServerVersion));

// Spec #37, User Story 10: a cursor is an opaque string, passed back unchanged.
export const listServers = (
  base: string,
  query: { readonly search?: string; readonly cursor?: string },
) => {
  const params = new URLSearchParams({ version: "latest" });
  if (query.search !== undefined) params.set("search", query.search);
  if (query.cursor !== undefined) params.set("cursor", query.cursor);
  return getJson(
    base,
    `/servers?${params.toString()}`,
    decodeServerList,
    "Servers not found",
    "the search term must be at least 3 characters.",
  ).pipe(
    Effect.map((list) => ({
      servers: (list.servers ?? []).map(toServerVersion),
      nextCursor: list.metadata?.nextCursor || undefined,
    })),
  );
};
