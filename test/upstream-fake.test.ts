import { Effect } from "effect";
import { expect, it } from "vitest";
import { Upstream } from "../src/upstream.ts";
import { fakeUpstream } from "./harness.ts";

it("disposes fake sources when the preflight scope closes", async () => {
  const source = "owner/repo";
  const commit = "a".repeat(40);
  const error = await Effect.runPromise(
    Upstream.use((upstream) =>
      Effect.gen(function* () {
        const handle = yield* Effect.scoped(upstream.resolveSource(source, commit));
        return yield* upstream.install(handle, {}).pipe(Effect.flip);
      }),
    ).pipe(Effect.provide(fakeUpstream({ skills: { [JSON.stringify([source, commit])]: ["a"] } }))),
  );
  expect(error.message).toContain("disposed");
});
