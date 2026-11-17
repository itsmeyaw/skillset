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
const universal = { ...cursor, id: "universal", name: "Universal", universal: true };
const universalCursor = { ...cursor, universal: true };
const windsurf = { ...cursor, id: "windsurf", name: "Windsurf" };

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
        skills: {
          [JSON.stringify(["https://github.com/owner/repo.git", commit])]: ["alpha", "beta"],
        },
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

it.effect("interactive install collapses Universal agents and selects the defaults", () =>
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
    const members = Array.from({ length: 9 }, (_, index) => ({
      ...universal,
      id: `member${index + 1}`,
      name: `Agent${index + 1}`,
    }));
    const result = yield* runCli(["install", "-s", "alpha", "-g", "--copy", "--set", file], {
      tty: true,
      keys: [key("enter"), key("enter"), key("escape")],
      upstream: {
        supportedAgents: [universal, claude, universalCursor, ...members, windsurf],
        detectedAgents: [universalCursor, windsurf],
        skills: { [JSON.stringify(["https://github.com/owner/repo.git", commit])]: ["alpha"] },
        installDir: dir,
      },
    });
    assert.strictEqual(result.code, 0);
    const screen = result.screen.join("");
    assert.include(screen, "❯ [x] Universal (.agents/skills)");
    assert.include(
      screen,
      "Cursor, Agent1, Agent2, Agent3, Agent4, Agent5, Agent6, Agent7 +2 more",
    );
    assert.notMatch(screen, /\[[ x]\] (Cursor|Agent[0-9])/);
    assert.include(screen, "[x] Claude Code");
    assert.include(screen, "[x] Windsurf");
    assert.include(result.out.join("\n"), "Agents: universal, claude-code, windsurf");
    for (const agent of ["universal", "claude-code", "windsurf"])
      assert.strictEqual(
        yield* fs.readFileString(`${dir}/global/${agent}/alpha`),
        `${commit}:copy`,
      );
    assert.isFalse(yield* fs.exists(`${dir}/global/cursor/alpha`));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("interactive install lets users deselect default agents", () =>
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
      keys: [key("space"), key("enter"), key("enter"), key("escape")],
      upstream: {
        supportedAgents: [universal, claude, universalCursor],
        skills: { [JSON.stringify(["https://github.com/owner/repo.git", commit])]: ["alpha"] },
        installDir: dir,
      },
    });
    assert.strictEqual(result.code, 0);
    assert.include(result.screen.join(""), "\n  Cursor\r");
    assert.include(result.out.join("\n"), "Agents: claude-code");
    assert.isFalse(yield* fs.exists(`${dir}/global/universal/alpha`));
    assert.isTrue(yield* fs.exists(`${dir}/global/claude-code/alpha`));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("interactive install rejects an empty supported agent list", () =>
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
    const result = yield* runCli(["install", "-s", "alpha", "--set", file], {
      tty: true,
      upstream: { supportedAgents: [] },
    });
    assert.strictEqual(result.code, 1);
    assert.include(result.err.join("\n"), "No supported agents available");
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
        skills: { [JSON.stringify(["https://github.com/owner/repo.git", commit])]: ["alpha"] },
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
        skills: { [JSON.stringify(["https://github.com/owner/repo.git", commit])]: ["alpha"] },
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
        supportedAgents: [universal, claude, universalCursor, windsurf],
        detectedAgents: [universalCursor, windsurf],
        skills: { [JSON.stringify(["https://github.com/owner/repo.git", commit])]: ["alpha"] },
        installDir: dir,
      },
    });
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(result.screen, []);
    for (const agent of ["universal", "claude-code", "windsurf"])
      assert.strictEqual(
        yield* fs.readFileString(`${dir}/project/${agent}/alpha`),
        `${commit}:auto`,
      );
    assert.isFalse(yield* fs.exists(`${dir}/project/cursor/alpha`));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("unattended defaults exclude unavailable and unsupported agents", () =>
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
    const result = yield* runCli(["install", "-y", "--set", file], {
      upstream: {
        supportedAgents: [windsurf],
        detectedAgents: [windsurf, claude, universalCursor],
        skills: { [JSON.stringify(["https://github.com/owner/repo.git", commit])]: ["alpha"] },
        installDir: dir,
      },
    });
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(yield* fs.readDirectory(`${dir}/project`), ["windsurf"]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("-y without any default agent falls back to upstream defaults", () =>
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
    const result = yield* runCli(["install", "-y", "--set", file], {
      upstream: {
        supportedAgents: [cursor],
        detectedAgents: [],
        skills: { [JSON.stringify(["https://github.com/owner/repo.git", commit])]: ["alpha"] },
        installDir: dir,
      },
    });
    assert.strictEqual(result.code, 0);
    assert.isTrue((yield* fs.readDirectory(`${dir}/project`)).length > 0);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("explicit Universal agent IDs stay unchanged", () =>
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
    const result = yield* runCli(["install", "-y", "-a", "cursor", "--set", file], {
      upstream: {
        supportedAgents: [universal, claude, universalCursor],
        detectedAgents: [universalCursor],
        skills: { [JSON.stringify(["https://github.com/owner/repo.git", commit])]: ["alpha"] },
        installDir: dir,
      },
    });
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(yield* fs.readDirectory(`${dir}/project`), ["cursor"]);
    assert.strictEqual(yield* fs.readFileString(`${dir}/project/cursor/alpha`), `${commit}:auto`);
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
          skills: {
            [JSON.stringify(["https://github.com/owner/repo.git", commit])]: ["alpha", "unlisted"],
          },
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
      upstream: {
        skills: { [JSON.stringify(["https://github.com/owner/repo.git", commit])]: ["alpha"] },
      },
    });
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /missing/i);
    assert.strictEqual(yield* fs.readFileString(file), original);
    assert.deepStrictEqual(yield* fs.readDirectory(dir), ["skillset.json"]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("install reports skipped targets without claiming they were installed", () =>
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
    const result = yield* runCli(["install", "-y", "-a", "cursor", "--set", file], {
      upstream: {
        skills: {
          [JSON.stringify(["https://github.com/owner/repo.git", commit])]: ["alpha", "beta"],
        },
        skippedSkills: ["beta"],
        installDir: dir,
      },
    });
    assert.strictEqual(result.code, 0);
    assert.include(result.out.join("\n"), "Skipped beta");
    assert.include(result.out.join("\n"), "Installed alpha");
    assert.notInclude(result.out.join("\n"), "Installed alpha, beta");
    assert.isFalse(yield* fs.exists(`${dir}/project/cursor/beta`));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("install does not report success when every target is skipped", () =>
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
    const result = yield* runCli(["install", "-y", "-a", "cursor", "--set", file], {
      upstream: {
        skills: { [JSON.stringify(["https://github.com/owner/repo.git", commit])]: ["alpha"] },
        skippedSkills: ["alpha"],
      },
    });
    assert.strictEqual(result.code, 0);
    assert.include(result.out.join("\n"), "Skipped alpha");
    assert.notInclude(result.out.join("\n"), "Installed");
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
          [JSON.stringify(["https://github.com/first/repo.git", commit])]: ["alpha"],
          [JSON.stringify(["https://github.com/second/repo.git", commit])]: ["beta"],
          [JSON.stringify(["https://github.com/third/repo.git", commit])]: ["gamma"],
        },
        failedResults: ["https://github.com/second/repo.git"],
        installDir: dir,
        disposalLog: `${dir}/disposed`,
      },
    });
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /failed.*second\/repo/i);
    assert.isTrue(yield* fs.exists(`${dir}/project/universal/alpha`));
    assert.isFalse(yield* fs.exists(`${dir}/project/universal/gamma`));
    assert.deepStrictEqual(
      (yield* fs.readFileString(`${dir}/disposed`)).trim().split("\n").sort(),
      [
        `https://github.com/first/repo.git ${commit}`,
        `https://github.com/second/repo.git ${commit}`,
        `https://github.com/third/repo.git ${commit}`,
      ],
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
    yield* fs.makeDirectory(`${dir}/project/universal`, { recursive: true });
    yield* fs.writeFileString(`${dir}/project/universal/custom`, "mine");
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
          [JSON.stringify(["https://github.com/owner/repo.git", commit])]: [
            "alpha",
            "beta",
            "outside",
          ],
          [JSON.stringify(["https://github.com/owner/repo.git", second])]: ["gamma"],
        },
        installDir: dir,
        disposalLog: log,
      },
    });
    assert.strictEqual(result.code, 0);
    assert.strictEqual(
      yield* fs.readFileString(`${dir}/project/universal/alpha`),
      `${commit}:auto`,
    );
    assert.strictEqual(yield* fs.readFileString(`${dir}/project/universal/beta`), `${commit}:auto`);
    assert.strictEqual(
      yield* fs.readFileString(`${dir}/project/universal/gamma`),
      `${second}:auto`,
    );
    assert.strictEqual(yield* fs.readFileString(`${dir}/project/universal/custom`), "mine");
    assert.isFalse(yield* fs.exists(`${dir}/project/universal/outside`));
    assert.deepStrictEqual((yield* fs.readFileString(log)).trim().split("\n").sort(), [
      `https://github.com/owner/repo.git ${commit}`,
      `https://github.com/owner/repo.git ${second}`,
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
        skills: { [JSON.stringify(["https://github.com/first/repo.git", commit])]: ["alpha"] },
        installDir: dir,
        disposalLog: log,
      },
    });
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /broken\/repo/);
    assert.isFalse(yield* fs.exists(`${dir}/project`));
    assert.strictEqual(
      yield* fs.readFileString(log),
      `https://github.com/first/repo.git ${commit}\n`,
    );
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
    assert.include(result.err.join("\n"), "Unknown skills: missing");
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
          [JSON.stringify(["https://github.com/first/repo.git", commit])]: ["alpha"],
          [JSON.stringify(["https://github.com/second/repo.git", commit])]: ["beta"],
        },
        failedInstalls: ["https://github.com/first/repo.git"],
        installDir: dir,
        disposalLog: `${dir}/disposed`,
      },
    });
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /first\/repo/);
    assert.isFalse(yield* fs.exists(`${dir}/project`));
    assert.deepStrictEqual(
      (yield* fs.readFileString(`${dir}/disposed`)).trim().split("\n").sort(),
      [
        `https://github.com/first/repo.git ${commit}`,
        `https://github.com/second/repo.git ${commit}`,
      ],
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
