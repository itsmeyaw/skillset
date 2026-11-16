import { assert, it } from "@effect/vitest";
import { expandSkillFlags } from "../src/argv.ts";

it("keeps a User Skillset name after an agent", () => {
  assert.deepStrictEqual(expandSkillFlags(["install", "-a", "opencode", "my-set"]), [
    "install",
    "-a",
    "opencode",
    "my-set",
  ]);
});

for (const flag of ["-a", "--agent"]) {
  it(`expands known agents after ${flag} but stops at a User Skillset name`, () => {
    assert.deepStrictEqual(
      expandSkillFlags(["install", flag, "opencode", "claude-code", "my-set"]),
      ["install", flag, "opencode", flag, "claude-code", "my-set"],
    );
  });
}

it("preserves an unknown first agent for validation", () => {
  assert.deepStrictEqual(expandSkillFlags(["install", "-a", "unknown", "my-set"]), [
    "install",
    "-a",
    "unknown",
    "my-set",
  ]);
});

it("keeps multiple skills before a Source", () => {
  assert.deepStrictEqual(expandSkillFlags(["add", "-s", "a", "b", "owner/repo"]), [
    "add",
    "-s",
    "a",
    "-s",
    "b",
    "owner/repo",
  ]);
});

for (const argument of ["a", "i", "add", "install"]) {
  it(`does not treat later ${argument} as the subcommand`, () => {
    assert.deepStrictEqual(expandSkillFlags(["remove", argument, "-s", "alpha", "owner/repo"]), [
      "remove",
      argument,
      "-s",
      "alpha",
      "-s",
      "owner/repo",
    ]);
  });
}

it("finds the subcommand after shared and global option values", () => {
  assert.deepStrictEqual(
    expandSkillFlags(["--set", "a", "--log-level", "info", "a", "-s", "alpha", "owner/repo"]),
    ["--set", "a", "--log-level", "info", "a", "-s", "alpha", "owner/repo"],
  );
});
