import { createRequire } from "node:module";
import { assert, it } from "@effect/vitest";
import { Effect } from "effect";
import { runCli } from "./harness.ts";

for (const command of ["add", "list", "install"]) {
  it.effect(`${command} --help shows usage without reading a file`, () =>
    Effect.gen(function* () {
      const result = yield* runCli([command, "--help"]);
      assert.strictEqual(result.code, 0);
      assert.match(result.out.join("\n"), new RegExp(command, "i"));
    }),
  );
}

it.effect("--version matches package metadata", () =>
  Effect.gen(function* () {
    const { version } = createRequire(import.meta.url)("../package.json") as { version: string };
    const result = yield* runCli(["--version"]);
    assert.strictEqual(result.code, 0);
    assert.include(result.out.join("\n"), version);
  }),
);
