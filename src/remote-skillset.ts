import { Context, Effect } from "effect";
import { fetchBoundedText } from "./bounded-fetch.ts";
import { CliMessageError } from "./errors.ts";
import { parseSkillset } from "./skillset-file.ts";

export class RemoteFetch extends Context.Service<RemoteFetch, typeof fetch>()(
  "skillset/RemoteFetch",
) {}

export const isRemoteSkillset = (value: string) => /^https:\/\//iu.test(value);
export const isHttpUrl = (value: string) => /^http:\/\//iu.test(value);
export const rejectRemoteSkillset = () =>
  new CliMessageError({ message: "Remote Skillsets can only be installed or listed." });

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
      const url = new URL(given);
      const blob = url.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/u);
      if (url.hostname.toLowerCase() === "github.com" && blob) {
        url.hostname = "raw.githubusercontent.com";
        url.pathname = `/${blob[1]}/${blob[2]}/${blob[3]}/${blob[4]}`;
      }
      return fetchBoundedText(url, fetchRemote);
    },
    catch: (error) =>
      new CliMessageError({
        message: `Cannot fetch Skillset ${reference}: ${error instanceof Error ? error.message : String(error)}`,
      }),
  }).pipe(Effect.flatMap((text) => parseSkillset(text, reference)));
};
