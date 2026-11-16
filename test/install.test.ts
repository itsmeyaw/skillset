import { NodeFileSystem } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import { SCHEMA_URL } from "../src/skillset-file.ts";
import { key, runCli } from "./harness.ts";

const commit = "a".repeat(40);
const cursor = {
  id: "cursor",
  name: "Cursor",
  projectSkillsDir: ".cursor/skills",
  globalSkillsDir: null,
  universal: false,
};
const claude = { ...cursor, id: "claude-code", name: "Claude Code" };

it.effect.each([
  { flags: ["-y"], tty: false },
  { flags: [], tty: true },
  { flags: ["-y", "-s", "missing"], tty: false },
])("install empty Skillset skips installation and prompts", ({ flags, tty }) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const installCalls: Array<string> = [];
    yield* fs.writeFileString(file, JSON.stringify({ $schema: SCHEMA_URL, skills: [] }));
    const result = yield* runCli(["install", ...flags, "--set", file], {
      tty,
      keys: [key("escape")],
      upstream: { installDir: dir, installCalls },
    });
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(result.out, ["This Skillset is empty."]);
    assert.deepStrictEqual(result.screen, []);
    assert.deepStrictEqual(installCalls, []);
    assert.deepStrictEqual(yield* fs.readDirectory(dir), ["skillset.json"]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("install Source without a non-interactive selection only lists skills", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const result = yield* runCli(["install", "owner/repo", "-y", "--set", file], {
      upstream: {
        commits: { [JSON.stringify(["owner/repo", null])]: commit },
        skills: { [JSON.stringify(["owner/repo", commit])]: ["alpha"] },
        installDir: dir,
      },
    });
    assert.strictEqual(result.code, 0);
    assert.include(result.out.join("\n"), "alpha");
    assert.isFalse(yield* fs.exists(file));
    assert.isFalse(yield* fs.exists(`${dir}/project`));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("interactive install Source selects skills, then all Entries and searchable agents", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const old = { name: "old", source: "other/repo", commit };
    yield* fs.writeFileString(file, JSON.stringify({ $schema: SCHEMA_URL, skills: [old] }));
    const result = yield* runCli(["install", "owner/repo", "-g", "--copy", "--set", file], {
      tty: true,
      keys: [
        key("l", "l"),
        key("space"),
        key("enter"),
        ...Array.from("claude-code", (char) => key(char, char)),
        key("space"),
        key("enter"),
        key("enter"),
      ],
      upstream: {
        commits: { [JSON.stringify(["owner/repo", null])]: commit },
        skills: {
          [JSON.stringify(["owner/repo", commit])]: [
            { name: "alpha", description: "First skill" },
            { name: "beta", description: "Second skill" },
          ],
          [JSON.stringify(["other/repo", commit])]: ["old"],
        },
        supportedAgents: [cursor, claude],
        installDir: dir,
      },
    });
    assert.strictEqual(result.code, 0);
    assert.include(result.screen.join(""), "First skill");
    assert.include(result.out.join("\n"), "Adding: alpha");
    assert.isTrue(yield* fs.exists(`${dir}/global/claude-code/alpha`));
    assert.isTrue(yield* fs.exists(`${dir}/global/claude-code/old`));
    assert.isFalse(yield* fs.exists(`${dir}/global/cursor/alpha`));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("install Source shares conflicts and Pin refresh with add", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const oldCommit = "b".repeat(40);
    const original = JSON.stringify({
      $schema: SCHEMA_URL,
      skills: [{ name: "alpha", source: "other/repo", commit: oldCommit }],
    });
    yield* fs.writeFileString(file, original);
    const upstream = {
      commits: { [JSON.stringify(["owner/repo", null])]: commit },
      skills: { [JSON.stringify(["owner/repo", commit])]: ["alpha"] },
      installDir: dir,
    };
    const conflict = yield* runCli(["i", "-s", "alpha", "owner/repo", "-y", "--set", file], {
      upstream,
    });
    assert.strictEqual(conflict.code, 1);
    assert.match(conflict.err.join("\n"), /alpha.*other\/repo/);
    assert.strictEqual(yield* fs.readFileString(file), original);
    yield* fs.writeFileString(
      file,
      JSON.stringify({
        $schema: SCHEMA_URL,
        skills: [{ name: "alpha", source: "owner/repo", commit: oldCommit }],
      }),
    );
    const refresh = yield* runCli(["i", "-s", "alpha", "owner/repo", "-y", "--set", file], {
      upstream,
    });
    assert.strictEqual(refresh.code, 0);
    assert.deepStrictEqual(JSON.parse(yield* fs.readFileString(file)).skills, [
      { name: "alpha", source: "owner/repo", commit },
    ]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("install Source cancellation before confirmation writes nothing", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const result = yield* runCli(["install", "owner/repo", "--set", file], {
      tty: true,
      keys: [key("escape")],
      upstream: {
        commits: { [JSON.stringify(["owner/repo", null])]: commit },
        skills: { [JSON.stringify(["owner/repo", commit])]: ["alpha"] },
      },
    });
    assert.strictEqual(result.code, 130);
    assert.include(result.out.join("\n"), "Cancelled");
    assert.isFalse(yield* fs.exists(file));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("install Source adds selected skills and installs all Entries", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const old = { name: "old", source: "other/repo", commit };
    yield* fs.writeFileString(file, JSON.stringify({ $schema: SCHEMA_URL, skills: [old] }));
    const upstream = {
      commits: { [JSON.stringify(["owner/repo", null])]: commit },
      skills: {
        [JSON.stringify(["owner/repo", commit])]: ["alpha", "beta"],
        [JSON.stringify(["other/repo", commit])]: ["old"],
      },
      installDir: dir,
    };
    const result = yield* runCli(["install", "owner/repo", "-s", "alpha", "-y", "--set", file], {
      upstream,
    });
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(JSON.parse(yield* fs.readFileString(file)).skills, [
      { name: "alpha", source: "owner/repo", commit },
      old,
    ]);
    assert.isTrue(yield* fs.exists(`${dir}/project/default/alpha`));
    assert.isTrue(yield* fs.exists(`${dir}/project/default/old`));
    assert.isFalse(yield* fs.exists(`${dir}/project/default/beta`));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("install Source checks all Entries before writing the file", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const original = JSON.stringify({
      $schema: SCHEMA_URL,
      skills: [{ name: "old", source: "other/repo", commit }],
    });
    yield* fs.writeFileString(file, original);
    const result = yield* runCli(["install", "owner/repo", "--all", "-y", "--set", file], {
      upstream: {
        commits: { [JSON.stringify(["owner/repo", null])]: commit },
        skills: { [JSON.stringify(["owner/repo", commit])]: ["alpha"] },
        installDir: dir,
      },
    });
    assert.strictEqual(result.code, 1);
    assert.strictEqual(yield* fs.readFileString(file), original);
    assert.isFalse(yield* fs.exists(`${dir}/project`));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("install Source checks existing Pins before asking for confirmation", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const original = JSON.stringify({
      $schema: SCHEMA_URL,
      skills: [{ name: "old", source: "other/repo", commit }],
    });
    yield* fs.writeFileString(file, original);
    const result = yield* runCli(
      ["install", "owner/repo", "-s", "alpha", "-a", "cursor", "-g", "--copy", "--set", file],
      {
        tty: true,
        keys: [key("n", "n")],
        upstream: {
          commits: { [JSON.stringify(["owner/repo", null])]: commit },
          skills: { [JSON.stringify(["owner/repo", commit])]: ["alpha"] },
        },
      },
    );
    assert.strictEqual(result.code, 1);
    assert.notInclude(result.screen.join(""), "Proceed with installation?");
    assert.strictEqual(yield* fs.readFileString(file), original);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("install failure leaves newly added Entries in the file", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const result = yield* runCli(["install", "owner/repo", "--all", "-y", "--set", file], {
      upstream: {
        commits: { [JSON.stringify(["owner/repo", null])]: commit },
        skills: { [JSON.stringify(["owner/repo", commit])]: ["alpha"] },
        failedInstalls: ["owner/repo"],
      },
    });
    assert.strictEqual(result.code, 1);
    assert.deepStrictEqual(JSON.parse(yield* fs.readFileString(file)).skills, [
      { name: "alpha", source: "owner/repo", commit },
    ]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("declining install Source writes nothing", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const result = yield* runCli(
      ["install", "owner/repo", "-s", "alpha", "-a", "cursor", "-g", "--copy", "--set", file],
      {
        tty: true,
        keys: [key("n", "n")],
        upstream: {
          commits: { [JSON.stringify(["owner/repo", null])]: commit },
          skills: { [JSON.stringify(["owner/repo", commit])]: ["alpha"] },
        },
      },
    );
    assert.strictEqual(result.code, 0);
    assert.match(result.out.join("\n"), /adding.*alpha/i);
    assert.isFalse(yield* fs.exists(file));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("cancelling an install prompt reports cancellation", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const original = JSON.stringify({
      $schema: SCHEMA_URL,
      skills: [{ name: "alpha", source: "owner/repo", commit }],
    });
    yield* fs.writeFileString(file, original);
    const result = yield* runCli(
      ["install", "-s", "alpha", "-a", "cursor", "-g", "--copy", "--set", file],
      { tty: true, keys: [key("escape")] },
    );
    assert.strictEqual(result.code, 130);
    assert.include(result.out.join("\n"), "Cancelled");
    assert.strictEqual(yield* fs.readFileString(file), original);
    assert.isFalse(yield* fs.exists(`${dir}/project`));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("declining the installation plan exits successfully without writing", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const original = JSON.stringify({
      $schema: SCHEMA_URL,
      skills: [{ name: "alpha", source: "owner/repo", commit }],
    });
    yield* fs.writeFileString(file, original);
    const result = yield* runCli(
      ["install", "-s", "alpha", "-a", "cursor", "-g", "--copy", "--set", file],
      { tty: true, keys: [key("n", "n")], upstream: { installDir: dir } },
    );
    assert.strictEqual(result.code, 0);
    assert.match(result.screen.join(""), /Proceed with installation\?/);
    assert.match(result.out.join("\n"), /alpha/);
    assert.match(result.out.join("\n"), /cursor/);
    assert.match(result.out.join("\n"), /global/i);
    assert.match(result.out.join("\n"), /copy/i);
    assert.strictEqual(yield* fs.readFileString(file), original);
    assert.deepStrictEqual(yield* fs.readDirectory(dir), ["skillset.json"]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("interactive install prompts in order and uses selected options", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    yield* fs.writeFileString(
      file,
      JSON.stringify({
        $schema: SCHEMA_URL,
        skills: [
          { name: "alpha", source: "owner/repo", commit },
          { name: "beta", source: "owner/repo", commit },
        ],
      }),
    );
    const result = yield* runCli(["install", "--set", file], {
      tty: true,
      keys: [
        key("down"),
        key("down"),
        key("down"),
        key("space"),
        key("enter"),
        key("enter"),
        key("down"),
        key("enter"),
        key("down"),
        key("enter"),
        key("enter"),
      ],
      upstream: {
        supportedAgents: [cursor, claude],
        detectedAgents: [claude],
        skills: { [JSON.stringify(["owner/repo", commit])]: ["alpha", "beta"] },
        installDir: dir,
      },
    });
    assert.strictEqual(result.code, 0);
    const screen = result.screen.join("");
    const prompts = [
      "Which skills?",
      "Which agents?",
      "Installation scope?",
      "Installation mode?",
      "Proceed with installation?",
    ];
    const positions = prompts.map((prompt) => screen.indexOf(prompt));
    assert.isTrue(positions.every((position) => position >= 0));
    assert.deepStrictEqual(
      positions,
      [...positions].sort((a, b) => a - b),
    );
    assert.strictEqual(
      yield* fs.readFileString(`${dir}/global/claude-code/alpha`),
      `${commit}:copy`,
    );
    assert.isFalse(yield* fs.exists(`${dir}/global/claude-code/beta`));
    assert.isFalse(yield* fs.exists(`${dir}/global/cursor/alpha`));
    assert.match(result.out.join("\n"), /alpha.*owner\/repo/s);
    assert.notMatch(result.out.join("\n"), /beta|cursor/i);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("interactive install requires an agent when none are detected", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    yield* fs.writeFileString(
      file,
      JSON.stringify({
        $schema: SCHEMA_URL,
        skills: [{ name: "alpha", source: "owner/repo", commit }],
      }),
    );
    const result = yield* runCli(["install", "-s", "alpha", "-g", "--copy", "--set", file], {
      tty: true,
      keys: [key("enter"), key("down"), key("down"), key("space"), key("enter"), key("enter")],
      upstream: {
        supportedAgents: [cursor],
        skills: { [JSON.stringify(["owner/repo", commit])]: ["alpha"] },
        installDir: dir,
      },
    });
    assert.strictEqual(result.code, 0);
    assert.match(result.screen.join(""), /At least 1 are required/);
    assert.strictEqual(yield* fs.readFileString(`${dir}/global/cursor/alpha`), `${commit}:copy`);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect.each([
  { flags: ["-s", "alpha"], skipped: "Which skills?" },
  { flags: ["-a", "cursor"], skipped: "Which agents?" },
  { flags: ["-g"], skipped: "Installation scope?" },
  { flags: ["--copy"], skipped: "Installation mode?" },
])("$skipped is skipped only when its flag is supplied", ({ flags, skipped }) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    yield* fs.writeFileString(
      file,
      JSON.stringify({
        $schema: SCHEMA_URL,
        skills: [{ name: "alpha", source: "owner/repo", commit }],
      }),
    );
    const result = yield* runCli(["install", ...flags, "--set", file], {
      tty: true,
      keys: Array.from({ length: 4 }, () => key("enter")),
      upstream: {
        supportedAgents: [cursor],
        detectedAgents: [cursor],
        skills: { [JSON.stringify(["owner/repo", commit])]: ["alpha"] },
        installDir: dir,
      },
    });
    assert.strictEqual(result.code, 0);
    const screen = result.screen.join("");
    for (const prompt of [
      "Which skills?",
      "Which agents?",
      "Installation scope?",
      "Installation mode?",
      "Proceed with installation?",
    ]) {
      assert.strictEqual(screen.includes(prompt), prompt !== skipped);
    }
    const scope = flags.includes("-g") ? "global" : "project";
    const mode = flags.includes("--copy") ? "copy" : "symlink";
    assert.strictEqual(
      yield* fs.readFileString(`${dir}/${scope}/cursor/alpha`),
      `${commit}:${mode}`,
    );
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect.each([
  { tty: true, flags: ["-y"] },
  { tty: false, flags: [] },
])("non-interactive install skips every prompt", ({ tty, flags }) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    yield* fs.writeFileString(
      file,
      JSON.stringify({
        $schema: SCHEMA_URL,
        skills: [{ name: "alpha", source: "owner/repo", commit }],
      }),
    );
    const result = yield* runCli(["install", ...flags, "--set", file], {
      tty,
      upstream: {
        skills: { [JSON.stringify(["owner/repo", commit])]: ["alpha"] },
        installDir: dir,
      },
    });
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(result.screen, []);
    assert.strictEqual(yield* fs.readFileString(`${dir}/project/default/alpha`), `${commit}:auto`);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("install -y installs only selected Entries at their Pins with requested options", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    yield* fs.writeFileString(
      file,
      JSON.stringify({
        $schema: SCHEMA_URL,
        skills: [
          { name: "alpha", source: "owner/repo#branch", commit },
          { name: "beta", source: "other/repo", commit: "b".repeat(40) },
        ],
      }),
    );
    const result = yield* runCli(
      [
        "install",
        "-y",
        "-s",
        "alpha",
        "-a",
        "claude-code",
        "cursor",
        "-g",
        "--copy",
        "--set",
        file,
      ],
      {
        upstream: {
          skills: { [JSON.stringify(["owner/repo#branch", commit])]: ["alpha", "unlisted"] },
          installDir: dir,
        },
      },
    );
    assert.strictEqual(result.code, 0);
    assert.include(result.out.join("\n"), "Installed alpha");
    assert.strictEqual(
      yield* fs.readFileString(`${dir}/global/claude-code/alpha`),
      `${commit}:copy`,
    );
    assert.strictEqual(yield* fs.readFileString(`${dir}/global/cursor/alpha`), `${commit}:copy`);
    assert.isFalse(yield* fs.exists(`${dir}/global/claude-code/unlisted`));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("install -y rejects an Entry missing at its Pin before writing", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const original = JSON.stringify({
      $schema: SCHEMA_URL,
      skills: [{ name: "missing", source: "owner/repo", commit }],
    });
    yield* fs.writeFileString(file, original);
    const result = yield* runCli(["install", "-y", "--set", file], {
      upstream: { skills: { [JSON.stringify(["owner/repo", commit])]: ["alpha"] } },
    });
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /missing/i);
    assert.strictEqual(yield* fs.readFileString(file), original);
    assert.deepStrictEqual(yield* fs.readDirectory(dir), ["skillset.json"]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("install stops after an upstream install reports a failed target", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    yield* fs.writeFileString(
      file,
      JSON.stringify({
        $schema: SCHEMA_URL,
        skills: [
          { name: "alpha", source: "first/repo", commit },
          { name: "beta", source: "second/repo", commit },
          { name: "gamma", source: "third/repo", commit },
        ],
      }),
    );
    const result = yield* runCli(["install", "-y", "--set", file], {
      upstream: {
        skills: {
          [JSON.stringify(["first/repo", commit])]: ["alpha"],
          [JSON.stringify(["second/repo", commit])]: ["beta"],
          [JSON.stringify(["third/repo", commit])]: ["gamma"],
        },
        failedResults: ["second/repo"],
        installDir: dir,
        disposalLog: `${dir}/disposed`,
      },
    });
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /failed.*second\/repo/i);
    assert.isTrue(yield* fs.exists(`${dir}/project/default/alpha`));
    assert.isFalse(yield* fs.exists(`${dir}/project/default/gamma`));
    assert.deepStrictEqual(
      (yield* fs.readFileString(`${dir}/disposed`)).trim().split("\n").sort(),
      [`first/repo ${commit}`, `second/repo ${commit}`, `third/repo ${commit}`],
    );
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("install -y uses default targets and leaves unrelated skills untouched", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const log = `${dir}/disposed`;
    const second = "b".repeat(40);
    yield* fs.makeDirectory(`${dir}/project/default`, { recursive: true });
    yield* fs.writeFileString(`${dir}/project/default/custom`, "mine");
    yield* fs.writeFileString(
      file,
      JSON.stringify({
        $schema: SCHEMA_URL,
        skills: [
          { name: "alpha", source: "owner/repo", commit },
          { name: "beta", source: "owner/repo", commit },
          { name: "gamma", source: "owner/repo", commit: second },
        ],
      }),
    );
    const result = yield* runCli(["install", "-y", "--set", file], {
      upstream: {
        skills: {
          [JSON.stringify(["owner/repo", commit])]: ["alpha", "beta", "outside"],
          [JSON.stringify(["owner/repo", second])]: ["gamma"],
        },
        installDir: dir,
        disposalLog: log,
      },
    });
    assert.strictEqual(result.code, 0);
    assert.strictEqual(yield* fs.readFileString(`${dir}/project/default/alpha`), `${commit}:auto`);
    assert.strictEqual(yield* fs.readFileString(`${dir}/project/default/beta`), `${commit}:auto`);
    assert.strictEqual(yield* fs.readFileString(`${dir}/project/default/gamma`), `${second}:auto`);
    assert.strictEqual(yield* fs.readFileString(`${dir}/project/default/custom`), "mine");
    assert.isFalse(yield* fs.exists(`${dir}/project/default/outside`));
    assert.deepStrictEqual((yield* fs.readFileString(log)).trim().split("\n").sort(), [
      `owner/repo ${commit}`,
      `owner/repo ${second}`,
    ]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("a failed later preflight leaves installs untouched and releases earlier sources", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const log = `${dir}/disposed`;
    yield* fs.writeFileString(
      file,
      JSON.stringify({
        $schema: SCHEMA_URL,
        skills: [
          { name: "alpha", source: "first/repo", commit },
          { name: "beta", source: "broken/repo", commit },
        ],
      }),
    );
    const result = yield* runCli(["install", "-y", "--set", file], {
      upstream: {
        skills: { [JSON.stringify(["first/repo", commit])]: ["alpha"] },
        installDir: dir,
        disposalLog: log,
      },
    });
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /broken\/repo/);
    assert.isFalse(yield* fs.exists(`${dir}/project`));
    assert.strictEqual(yield* fs.readFileString(log), `first/repo ${commit}\n`);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("install rejects invalid Pins before fetching", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    yield* fs.writeFileString(
      file,
      JSON.stringify({
        $schema: SCHEMA_URL,
        skills: [{ name: "alpha", source: "owner/repo", commit: "main" }],
      }),
    );
    const result = yield* runCli(["install", "-y", "--set", file]);
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /invalid Skillset file/i);
    assert.deepStrictEqual(yield* fs.readDirectory(dir), ["skillset.json"]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("install rejects unknown selected names before fetching", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    yield* fs.writeFileString(
      file,
      JSON.stringify({
        $schema: SCHEMA_URL,
        skills: [{ name: "alpha", source: "owner/repo", commit }],
      }),
    );
    const result = yield* runCli(["install", "-y", "-s", "missing", "--set", file]);
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /missing/i);
    assert.deepStrictEqual(yield* fs.readDirectory(dir), ["skillset.json"]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("an install error stops later Sources and releases all fetched Sources", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    yield* fs.writeFileString(
      file,
      JSON.stringify({
        $schema: SCHEMA_URL,
        skills: [
          { name: "alpha", source: "first/repo", commit },
          { name: "beta", source: "second/repo", commit },
        ],
      }),
    );
    const result = yield* runCli(["install", "--set", file], {
      upstream: {
        skills: {
          [JSON.stringify(["first/repo", commit])]: ["alpha"],
          [JSON.stringify(["second/repo", commit])]: ["beta"],
        },
        failedInstalls: ["first/repo"],
        installDir: dir,
        disposalLog: `${dir}/disposed`,
      },
    });
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /first\/repo/);
    assert.isFalse(yield* fs.exists(`${dir}/project`));
    assert.deepStrictEqual(
      (yield* fs.readFileString(`${dir}/disposed`)).trim().split("\n").sort(),
      [`first/repo ${commit}`, `second/repo ${commit}`],
    );
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("install rejects an unknown Skillset schema before fetching", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    yield* fs.writeFileString(
      file,
      JSON.stringify({ $schema: "https://example.com/v2", skills: [] }),
    );
    const result = yield* runCli(["install", "-y", "--set", file]);
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /invalid Skillset file/i);
    assert.deepStrictEqual(yield* fs.readDirectory(dir), ["skillset.json"]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);
