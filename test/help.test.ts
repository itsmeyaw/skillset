import { createRequire } from "node:module";
import { assert, it } from "@effect/vitest";
import { Effect } from "effect";
import { NodeFileSystem } from "@effect/platform-node";
import { FileSystem } from "effect";
import { SCHEMA_URL } from "../src/skillset-file.ts";
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

it.effect("aliases execute their commands", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/set.json`;
    const commit = "a".repeat(40);
    const upstream = {
      commits: { [JSON.stringify(["owner/repo", null])]: commit },
      skills: { [JSON.stringify(["owner/repo", commit])]: ["alpha", "beta"] },
      installDir: dir,
    };
    const added = yield* runCli(["a", "-s", "alpha", "beta", "owner/repo", "--set", file], {
      upstream,
    });
    assert.strictEqual(added.code, 0);
    const listed = yield* runCli(["ls", "--set", file]);
    assert.include(listed.out.join("\n"), "alpha");
    assert.strictEqual((yield* runCli(["up", "--set", file], { upstream })).code, 0);
    assert.strictEqual((yield* runCli(["i", "-y", "--set", file], { upstream })).code, 0);
    assert.isTrue(yield* fs.exists(`${dir}/project/default/alpha`));
    assert.strictEqual((yield* runCli(["rm", "alpha", "--set", file])).code, 0);
    assert.deepStrictEqual(JSON.parse(yield* fs.readFileString(file)), {
      $schema: SCHEMA_URL,
      skills: [{ name: "beta", source: "owner/repo", commit }],
    });
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("--version matches package metadata", () =>
  Effect.gen(function* () {
    const { version } = createRequire(import.meta.url)("../package.json") as { version: string };
    const result = yield* runCli(["--version"]);
    assert.strictEqual(result.code, 0);
    assert.include(result.out.join("\n"), version);
  }),
);

it.effect("--wizard is rejected", () =>
  Effect.gen(function* () {
    const result = yield* runCli(["--wizard"]);
    assert.strictEqual(result.code, 1);
  }),
);

for (const [command, alias] of [
  ["install", "i"],
  ["add", "a"],
  ["remove", "rm"],
  ["update", "up"],
  ["list", "ls"],
] as const) {
  it.effect(`${alias} runs ${command} and appears in help`, () =>
    Effect.gen(function* () {
      const result = yield* runCli([alias, "--help"]);
      assert.strictEqual(result.code, 0);
      assert.include(result.out.join("\n"), command);
      const rootHelp = yield* runCli(["--help"]);
      assert.match(rootHelp.out.join("\n"), new RegExp(`${command}, ${alias}\\b`));
    }),
  );
}
