import { Effect } from "effect";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { Upstream } from "../src/upstream.ts";
import { fakeUpstream } from "./harness.ts";

it("returns undefined for missing refs", async () => {
  const result = await Effect.runPromise(
    Upstream.use((upstream) =>
      upstream.resolveRefs("https://example.com/repo", [undefined, "missing"]),
    ).pipe(Effect.provide(fakeUpstream())),
  );
  expect(result).toEqual([undefined, undefined]);
});

it("lists skill names and descriptions", async () => {
  const source = "owner/repo";
  const commit = "a".repeat(40);
  const skills = [{ name: "alpha", description: "First skill" }];
  const result = await Effect.runPromise(
    Upstream.use((upstream) =>
      upstream.withSession((session) => session.list(source, commit)),
    ).pipe(
      Effect.provide(fakeUpstream({ skills: { [JSON.stringify([source, commit])]: skills } })),
    ),
  );
  expect(result).toEqual(skills);
});

it("disposes fake sources when the session closes", async () => {
  const source = "owner/repo";
  const commit = "a".repeat(40);
  const dir = await mkdtemp(join(tmpdir(), "skillset-fake-"));
  const calls: Array<string> = [];
  try {
    const result = await Effect.runPromise(
      Upstream.use((upstream) =>
        upstream.withSession((session) => session.list(source, commit)),
      ).pipe(
        Effect.provide(
          fakeUpstream({
            calls,
            disposalLog: join(dir, "disposed"),
            skills: { [JSON.stringify([source, commit])]: ["a"] },
          }),
        ),
      ),
    );
    expect(result.map((skill) => skill.name)).toEqual(["a"]);
    expect(calls).toEqual([`resolveSource ${source} ${commit}`]);
    expect(await readFile(join(dir, "disposed"), "utf8")).toBe(`${source} ${commit}\n`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
