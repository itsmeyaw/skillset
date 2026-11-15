import { readFileSync } from "node:fs";
import { assert, it } from "@effect/vitest";
import { skillsetJsonSchema } from "../src/skillset-file.ts";

// Spec #1, Testing Decisions: the committed schema must match its generator.
it("commits the generated Skillset JSON Schema", () => {
  assert.strictEqual(
    readFileSync(new URL("../schemas/skillset/v1.json", import.meta.url), "utf8"),
    skillsetJsonSchema(),
  );
});
