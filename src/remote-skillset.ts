import { Context, Effect } from "effect";
import { CliMessageError } from "./errors.ts";
import { parseSkillset } from "./skillset-file.ts";

export class RemoteFetch extends Context.Service<RemoteFetch, typeof fetch>()(
  "skillset/RemoteFetch",
) {}

export const isRemoteSkillset = (value: string) => /^https:\/\//iu.test(value);
export const isHttpUrl = (value: string) => /^http:\/\//iu.test(value);
export const rejectRemoteSkillset = () =>
  new CliMessageError({ message: "Remote Skillsets can only be installed." });

const limit = 1024 * 1024;

export const fetchSkillset = (given: string, fetchRemote: typeof fetch) => {
  // Keep credentials and tokens in the URL out of error messages.
  const reference = (() => {
    try {
      const shown = new URL(given);
      return shown.origin + shown.pathname;
    } catch {
      return "the given URL";
    }
  })();
  return Effect.tryPromise({
    try: async () => {
      let url = new URL(given);
      const blob = url.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/u);
      if (url.hostname.toLowerCase() === "github.com" && blob) {
        url.hostname = "raw.githubusercontent.com";
        url.pathname = `/${blob[1]}/${blob[2]}/${blob[3]}/${blob[4]}`;
      }
      const signal = AbortSignal.timeout(10_000);
      // Match fetch's redirect limit to stop loops.
      for (let redirects = 0; redirects <= 20; redirects++) {
        if (url.protocol !== "https:") throw new Error("Redirects must use HTTPS.");
        const response = await fetchRemote(url.toString(), { signal, redirect: "manual" });
        if (
          [301, 302, 303, 307, 308].includes(response.status) &&
          response.headers.has("location")
        ) {
          await response.body?.cancel().catch(() => undefined);
          url = new URL(response.headers.get("location")!, url);
          continue;
        }
        if (!response.ok) {
          await response.body?.cancel().catch(() => undefined);
          throw new Error(`HTTP ${response.status}`);
        }
        if (Number(response.headers.get("content-length")) > limit) {
          await response.body?.cancel().catch(() => undefined);
          throw new Error("Body exceeds 1 MB.");
        }
        const reader = response.body?.getReader();
        const chunks: Array<Uint8Array> = [];
        let size = 0;
        if (reader) {
          try {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              size += value.byteLength;
              if (size > limit) throw new Error("Body exceeds 1 MB.");
              chunks.push(value);
            }
          } finally {
            await reader.cancel().catch(() => undefined);
          }
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return new TextDecoder().decode(bytes);
      }
      throw new Error("Too many redirects.");
    },
    catch: (error) =>
      new CliMessageError({
        message: `Cannot fetch Skillset ${reference}: ${error instanceof Error ? error.message : String(error)}`,
      }),
  }).pipe(Effect.flatMap((text) => parseSkillset(text, reference)));
};
