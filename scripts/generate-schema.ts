import { mkdirSync, writeFileSync } from "node:fs";
import { skillsetJsonSchema } from "../src/skillset-file.ts";

// Spec #1, Schema module: commit the generated versioned JSON Schema.
mkdirSync(new URL("../schemas/skillset/", import.meta.url), { recursive: true });
writeFileSync(new URL("../schemas/skillset/v1.json", import.meta.url), skillsetJsonSchema());
