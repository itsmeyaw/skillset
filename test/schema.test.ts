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

// JSON Schema 2020-12 §6.4: patterns should work across regular expression implementations.
it("exports portable control-character constraints for Skill Entry text", () => {
  const schema = JSON.parse(skillsetJsonSchema());
  const properties = schema.properties.skills.items.properties;
  for (const field of ["name", "source"]) {
    assert.strictEqual(properties[field].minLength, 1);
    for (const flags of ["", "u"]) {
      const pattern = new RegExp(properties[field].allOf[0].not.pattern, flags);
      assert.isFalse(pattern.test("café-🦊"));
      assert.isFalse(pattern.test("\u00a0\u2028"));
      assert.isTrue(pattern.test("\u0000"));
      assert.isTrue(pattern.test("\u001f"));
      assert.isTrue(pattern.test("\u007f"));
      assert.isTrue(pattern.test("\u009f"));
      assert.isTrue(pattern.test("skill\u001b[31m"));
      assert.isTrue(pattern.test("skill\u0007"));
      assert.isTrue(pattern.test("skill\u009b31m"));
      assert.isTrue(pattern.test("skill\n"));
    }
  }
});
