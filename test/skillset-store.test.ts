import { assert, it } from "@effect/vitest";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect, FileSystem, Option } from "effect";
import { SCHEMA_URL, type Skillset } from "../src/skillset-file.ts";
import type { McpEntry } from "../src/mcp-entry.ts";
import {
  addMcpEntry,
  isEmpty,
  movePin,
  openSkillset,
  removeMcpEntries,
  removeSkillEntries,
  replaceMcpEntry,
  selectMcpEntries,
  selectSkillEntries,
  upsertSkillEntries,
} from "../src/skillset-store.ts";

const alpha = { name: "alpha", source: "owner/repo", commit: "a".repeat(40) };
const beta = { name: "beta", source: "other/repo", commit: "b".repeat(40) };
const skillset: Skillset = { $schema: SCHEMA_URL, skills: [alpha, beta] };

it.effect("opens or creates a User Skillset and saves it", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const opened = yield* openSkillset(
      { set: Option.some("team"), missing: "create" },
      { SKILLSET_HOME: dir },
    );
    assert.strictEqual(opened.path, `${dir}/team.json`);
    assert.isTrue(isEmpty(opened.skillset));
    const saved = yield* opened.save({ ...skillset, skills: [beta, alpha] });
    assert.deepStrictEqual(saved, skillset);
    const loaded = yield* openSkillset(
      { set: Option.some("team"), missing: "fail" },
      { SKILLSET_HOME: dir },
    );
    assert.deepStrictEqual(loaded.skillset, skillset);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("reports missing references and rejects conflicting selectors", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const env = { SKILLSET_HOME: dir };
    const missing = yield* Effect.result(
      openSkillset({ set: Option.some("absent"), missing: "fail" }, env),
    );
    assert.strictEqual(missing._tag, "Failure");
    if (missing._tag === "Failure")
      assert.strictEqual(
        missing.failure.message,
        `Cannot find Skillset "absent" in ${dir}/absent.json`,
      );
    const conflict = yield* Effect.result(
      openSkillset({ set: Option.some("other"), positional: "team", missing: "fail" }, env),
    );
    assert.strictEqual(conflict._tag, "Failure");
    if (conflict._tag === "Failure")
      assert.strictEqual(conflict.failure.message, '"team" cannot be combined with --set.');
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it("selects known Skill Entries and reports unknown names", () => {
  assert.deepStrictEqual(selectSkillEntries(skillset, ["beta", "missing"]), {
    skillEntries: [beta],
    unknown: ["missing"],
  });
  assert.deepStrictEqual(selectSkillEntries(skillset, []), {
    skillEntries: [alpha, beta],
    unknown: [],
  });
});

it("upserts Skill Entries from the same Source and rejects conflicts", () => {
  const updated = { ...alpha, commit: "c".repeat(40) };
  assert.deepStrictEqual(Effect.runSync(upsertSkillEntries(skillset, [updated])), {
    ...skillset,
    skills: [beta, updated],
  });
  const result = Effect.runSync(
    upsertSkillEntries(skillset, [{ ...alpha, source: "another/repo" }]).pipe(Effect.result),
  );
  assert.strictEqual(result._tag, "Failure");
  if (result._tag === "Failure") {
    assert.strictEqual(result.failure._tag, "CliMessageError");
    assert.strictEqual(result.failure.message, "Skill alpha already belongs to owner/repo");
  }
});

it("removes Skill Entries and moves a Pin without changing other Skill Entries", () => {
  assert.deepStrictEqual(removeSkillEntries(skillset, ["alpha"]), { ...skillset, skills: [beta] });
  assert.deepStrictEqual(movePin(skillset, "alpha", "c".repeat(40)), {
    ...skillset,
    skills: [{ ...alpha, commit: "c".repeat(40) }, beta],
  });
  assert.isTrue(isEmpty(removeSkillEntries(skillset, ["alpha", "beta"])));
  assert.isFalse(isEmpty(skillset));
});

const gamma: McpEntry = { name: "alpha", launch: { type: "command", command: "node" } };
const delta: McpEntry = { name: "delta", launch: { type: "command", command: "bun" } };

it.effect("edits MCP Entries by name, apart from Skill Entries of the same name", () =>
  Effect.gen(function* () {
    const added = yield* addMcpEntry(skillset, gamma);
    assert.deepStrictEqual(added.mcp, [gamma]);
    assert.deepStrictEqual(added.skills, skillset.skills);
    const failure = yield* addMcpEntry(added, gamma).pipe(Effect.flip);
    assert.strictEqual(failure.message, "MCP server alpha already exists");
    const withDelta = yield* addMcpEntry(added, delta);
    const replaced = replaceMcpEntry(withDelta, {
      ...gamma,
      launch: { type: "command", command: "deno" },
    });
    assert.deepStrictEqual(replaced.mcp?.[0]?.launch, { type: "command", command: "deno" });
    assert.deepStrictEqual(selectMcpEntries(withDelta, ["delta", "nope"]), {
      mcpEntries: [delta],
      unknown: ["nope"],
    });
    assert.deepStrictEqual(removeMcpEntries(withDelta, ["alpha"]).mcp, [delta]);
  }),
);

it.effect("saving a Skillset whose last MCP Entry was removed drops the mcp key", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const opened = yield* openSkillset(
      { set: Option.some("team"), missing: "create" },
      { SKILLSET_HOME: dir },
    );
    yield* opened.save(yield* addMcpEntry(skillset, gamma));
    const reopened = yield* openSkillset(
      { set: Option.some("team"), missing: "fail" },
      { SKILLSET_HOME: dir },
    );
    assert.deepStrictEqual(reopened.skillset.mcp, [gamma]);
    yield* reopened.save(removeMcpEntries(reopened.skillset, ["alpha"]));
    assert.notInclude(yield* fs.readFileString(`${dir}/team.json`), "mcp");
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);
