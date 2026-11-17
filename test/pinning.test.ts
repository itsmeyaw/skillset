import { Effect } from "effect";
import { expect, it } from "vitest";
import { makePinning } from "../src/pinning.ts";
import { fakeUpstream } from "./harness.ts";
import { Upstream } from "../src/upstream.ts";

it("allows a failed Source lookup to be retried in the same run", async () => {
  const remote = "https://github.com/owner/repo.git";
  const commit = "a".repeat(40);
  let attempts = 0;
  const commits = {
    get [JSON.stringify([remote, null])]() {
      return ++attempts === 1 ? undefined : commit;
    },
  };
  const result = await Effect.runPromise(
    Upstream.use((upstream) =>
      upstream.withSession((session) =>
        Effect.gen(function* () {
          const pinning = yield* makePinning(session);
          yield* pinning.resolve("owner/repo").pipe(Effect.flip);
          return yield* pinning.resolve("owner/repo");
        }),
      ),
    ).pipe(
      Effect.provide(
        fakeUpstream({ commits, skills: { [JSON.stringify([remote, commit])]: ["alpha"] } }),
      ),
    ),
  );
  expect(result.commit).toBe(commit);
  expect(attempts).toBe(2);
});
