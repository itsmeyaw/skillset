import { NodeFileSystem } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, Exit, FileSystem, Option } from "effect";
import { homedir } from "node:os";
import { isUserSkillsetName, resolveSet, userDir } from "../src/user-skillset.ts";
import { runCli } from "./harness.ts";

const resolve = (value?: string, env: Record<string, string | undefined> = {}) =>
  Effect.runSync(resolveSet(Option.fromNullishOr(value), env));

// Issue #12: the `--set` resolution table.
it("--set omitted resolves to ./skillset.json", () => {
  assert.strictEqual(resolve(), "./skillset.json");
});

for (const path of ["my-set.json", "../x/A.JSON", "/abs/Set.Json", "sub/foo.json"]) {
  it(`--set ${path} is a path`, () => {
    assert.strictEqual(resolve(path, { SKILLSET_HOME: "/home-dir" }), path);
  });
}

for (const name of ["my-set", "a", "7up", "my_set.v2", "A-B"]) {
  it(`--set ${name} is a User Skillset`, () => {
    assert.strictEqual(resolve(name, { SKILLSET_HOME: "/home-dir" }), `/home-dir/${name}.json`);
  });
}

for (const value of ["./foo", "sub/foo", "-x", ".hidden", "", "a b"]) {
  it(`--set ${JSON.stringify(value)} is rejected`, () => {
    const exit = Effect.runSyncExit(resolveSet(Option.some(value), {}));
    assert.isTrue(Exit.isFailure(exit));
    assert.include(JSON.stringify(exit), `\\"${value}\\" is not a Skillset name or .json path.`);
  });
}

it("isUserSkillsetName rejects .json paths", () => {
  assert.isTrue(isUserSkillsetName("my-set"));
  assert.isFalse(isUserSkillsetName("x.json"));
  assert.isFalse(isUserSkillsetName("X.JSON"));
  assert.isFalse(isUserSkillsetName("owner/repo"));
});

// Issue #12: first rule that applies wins, never merged.
it("user directory precedence: SKILLSET_HOME, XDG_CONFIG_HOME, then ~/.skillset", () => {
  assert.strictEqual(userDir({ SKILLSET_HOME: "/s", XDG_CONFIG_HOME: "/x" }), "/s");
  assert.strictEqual(userDir({ XDG_CONFIG_HOME: "/x" }), "/x/skillset");
  assert.strictEqual(userDir({}), `${homedir()}/.skillset`);
  assert.strictEqual(userDir({ SKILLSET_HOME: "", XDG_CONFIG_HOME: "" }), `${homedir()}/.skillset`);
});

const withHome = <A, E, R>(effect: (home: string) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const home = `${dir}/user`;
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        const previous = process.env.SKILLSET_HOME;
        process.env.SKILLSET_HOME = home;
        return previous;
      }),
      (previous) =>
        Effect.sync(() => {
          if (previous === undefined) delete process.env.SKILLSET_HOME;
          else process.env.SKILLSET_HOME = previous;
        }),
    );
    return yield* effect(home);
  }).pipe(Effect.provide(NodeFileSystem.layer));

const upstream = () => {
  const commit = "a".repeat(40);
  return {
    commits: { [JSON.stringify(["owner/repo", null])]: commit },
    skills: { [JSON.stringify(["owner/repo", commit])]: ["alpha", "beta"] },
  };
};

it.effect("add --set <name> creates the User Skillset and the user directory", () =>
  withHome((home) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const result = yield* runCli(["add", "owner/repo", "-s", "alpha", "--set", "my-set"], {
        upstream: upstream(),
      });
      assert.strictEqual(result.code, 0);
      assert.include(JSON.parse(yield* fs.readFileString(`${home}/my-set.json`)).skills[0], {
        name: "alpha",
      });
    }),
  ),
);

it.effect("install <name> installs from the User Skillset and selects with -s", () =>
  withHome((home) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const up = { ...upstream(), installDir: dir };
      yield* runCli(["add", "owner/repo", "--all", "--set", "my-set"], { upstream: up });
      const result = yield* runCli(["install", "my-set", "-s", "beta", "-y"], { upstream: up });
      assert.strictEqual(result.code, 0);
      assert.isTrue(yield* fs.exists(`${dir}/project/default/beta`));
      assert.isFalse(yield* fs.exists(`${dir}/project/default/alpha`));
      assert.isTrue(yield* fs.exists(`${home}/my-set.json`));
    }),
  ),
);

for (const agents of [["opencode"], ["opencode", "claude-code"]]) {
  it.effect(`install -a ${agents.join(" ")} <name> installs the User Skillset`, () =>
    withHome(() =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fs.makeTempDirectoryScoped();
        const up = { ...upstream(), installDir: dir };
        const added = yield* runCli(["add", "owner/repo", "--all", "--set", "my-set"], {
          upstream: up,
        });
        assert.strictEqual(added.code, 0);
        const result = yield* runCli(["install", "-a", ...agents, "my-set", "-y"], {
          upstream: up,
        });
        assert.strictEqual(result.code, 0);
        for (const agent of agents) {
          assert.isTrue(yield* fs.exists(`${dir}/project/${agent}/alpha`));
          assert.isTrue(yield* fs.exists(`${dir}/project/${agent}/beta`));
        }
      }),
    ),
  );
}

it.effect("install <name> --set x is an error", () =>
  withHome(() =>
    Effect.gen(function* () {
      const result = yield* runCli(["install", "my-set", "--set", "other", "-y"]);
      assert.notStrictEqual(result.code, 0);
      assert.include(result.err.join("\n"), "cannot be combined with --set");
    }),
  ),
);

// Issue #22: invalid and missing positional references report the exact location.
it.effect("install rejects non-Skillset and missing references without writing", () =>
  withHome((home) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const previous = process.cwd();
      try {
        process.chdir(dir);
        for (const [arg, location] of [
          ["owner/repo", home],
          ["missing-set", `${home}/missing-set.json`],
          ["./missing.json", "./missing.json"],
        ] as const) {
          const result = yield* runCli(["install", arg, "-y"]);
          assert.strictEqual(result.code, 1);
          assert.include(
            result.err.join("\n"),
            `Cannot find Skillset "${arg}" in ${location}. To install a skill, use \`skillset add\`.`,
          );
        }
        assert.deepStrictEqual(yield* fs.readDirectory(dir), []);
        assert.isFalse(yield* fs.exists(home));
      } finally {
        process.chdir(previous);
      }
    }),
  ),
);

// ADR 0002: positional JSON paths use the same resolution as --set.
it.effect("install accepts a positional JSON path and preserves invalid-file errors", () =>
  withHome(() =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const file = `${dir}/team.json`;
      const up = { ...upstream(), installDir: dir };
      yield* runCli(["add", "owner/repo", "--all", "--set", file], { upstream: up });
      const result = yield* runCli(["install", file, "-y"], { upstream: up });
      assert.strictEqual(result.code, 0);
      assert.isTrue(yield* fs.exists(`${dir}/project/default/alpha`));
      yield* fs.writeFileString(file, "not json");
      const invalid = yield* runCli(["install", file, "-y"]);
      assert.strictEqual(invalid.code, 1);
      assert.include(invalid.err.join("\n"), "Invalid Skillset file");
      const badFlag = yield* runCli(["install", "--set", "owner/repo", "-y"]);
      assert.include(badFlag.err.join("\n"), '"owner/repo" is not a Skillset name or .json path.');
      const both = yield* runCli(["install", file, "--set", "other", "-y"]);
      assert.include(both.err.join("\n"), "cannot be combined with --set");
    }),
  ),
);

it.effect("ls -g lists User Skillset names sorted without .json", () =>
  withHome((home) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory(home, { recursive: true });
      for (const file of ["b.json", "a.json", "notes.txt", "bad name.json"])
        yield* fs.writeFileString(`${home}/${file}`, "{}");
      const result = yield* runCli(["ls", "-g"]);
      assert.strictEqual(result.code, 0);
      assert.deepStrictEqual(result.out, ["a", "b"]);
    }),
  ),
);

it.effect("ls -g prints nothing when the user directory is missing", () =>
  withHome(() =>
    Effect.gen(function* () {
      const result = yield* runCli(["list", "-g"]);
      assert.strictEqual(result.code, 0);
      assert.deepStrictEqual(result.out, []);
    }),
  ),
);

it.effect("ls -g --set x is an error", () =>
  withHome(() =>
    Effect.gen(function* () {
      const result = yield* runCli(["ls", "-g", "--set", "x"]);
      assert.notStrictEqual(result.code, 0);
      assert.include(result.err.join("\n"), "-g cannot be used with --set.");
    }),
  ),
);

it.effect("ls -g uses $XDG_CONFIG_HOME/skillset when SKILLSET_HOME is unset", () =>
  withHome(() =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const xdg = yield* fs.makeTempDirectoryScoped();
      yield* fs.makeDirectory(`${xdg}/skillset`);
      yield* fs.writeFileString(`${xdg}/skillset/via-xdg.json`, "{}");
      const previous = process.env.SKILLSET_HOME;
      delete process.env.SKILLSET_HOME;
      process.env.XDG_CONFIG_HOME = xdg;
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          delete process.env.XDG_CONFIG_HOME;
          if (previous !== undefined) process.env.SKILLSET_HOME = previous;
        }),
      );
      assert.deepStrictEqual((yield* runCli(["ls", "-g"])).out, ["via-xdg"]);
    }),
  ),
);
