import { assert, it } from "@effect/vitest";
import { Effect } from "effect";
import { SCHEMA_URL, type Skillset } from "../src/skillset-file.ts";
import {
  isEmpty,
  movePin,
  removeEntries,
  selectEntries,
  upsertEntries,
} from "../src/skillset-store.ts";

const alpha = { name: "alpha", source: "owner/repo", commit: "a".repeat(40) };
const beta = { name: "beta", source: "other/repo", commit: "b".repeat(40) };
const skillset: Skillset = { $schema: SCHEMA_URL, skills: [alpha, beta] };

it("selects known Entries and reports unknown names", () => {
  assert.deepStrictEqual(selectEntries(skillset, ["beta", "missing"]), {
    entries: [beta],
    unknown: ["missing"],
  });
  assert.deepStrictEqual(selectEntries(skillset, []), { entries: [alpha, beta], unknown: [] });
});

it("upserts Entries from the same Source and rejects conflicts", () => {
  const updated = { ...alpha, commit: "c".repeat(40) };
  assert.deepStrictEqual(Effect.runSync(upsertEntries(skillset, [updated])), {
    ...skillset,
    skills: [beta, updated],
  });
  const result = Effect.runSyncExit(
    upsertEntries(skillset, [{ ...alpha, source: "another/repo" }]),
  );
  assert.include(JSON.stringify(result), "Skill alpha already belongs to owner/repo");
});

it("removes Entries and moves a Pin without changing other Entries", () => {
  assert.deepStrictEqual(removeEntries(skillset, ["alpha"]), { ...skillset, skills: [beta] });
  assert.deepStrictEqual(movePin(skillset, "alpha", "c".repeat(40)), {
    ...skillset,
    skills: [{ ...alpha, commit: "c".repeat(40) }, beta],
  });
  assert.isTrue(isEmpty(removeEntries(skillset, ["alpha", "beta"])));
  assert.isFalse(isEmpty(skillset));
});
