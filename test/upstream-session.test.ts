import { Deferred, Effect } from "effect";
import { expect, it } from "vitest";
import { withUpstreamSession } from "../src/upstream-session.ts";

it("fetches Sources concurrently", async () => {
  const commit = "a".repeat(40);
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const second = yield* Deferred.make<void>();
      return yield* withUpstreamSession(
        // A sequential fetch never starts the second Source, so the first would wait forever.
        (remote) =>
          Effect.gen(function* () {
            if (remote.includes("/one")) yield* Deferred.await(second);
            else yield* Deferred.succeed(second, undefined);
            return { skills: [{ name: remote.includes("/one") ? "a" : "b", description: "" }] };
          }),
        (_source, names) =>
          Effect.succeed({
            installed: names.map((skill) => ({ skill, agent: "x" })),
            skipped: [],
            failed: [],
          }),
        (session) =>
          session.install(
            [
              { name: "a", source: "owner/one", commit },
              { name: "b", source: "owner/two", commit },
            ],
            { scope: "project", mode: "copy" },
          ),
      );
    }).pipe(Effect.timeout("1 second")),
  );
  expect(result.installed.map(({ skill }) => skill)).toEqual(["a", "b"]);
});
