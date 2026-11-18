import { Schema } from "effect";

// ECMA-48 §4.1: control characters can introduce terminal control functions.
export const entryText = Schema.String.check(
  Schema.isNonEmpty(),
  Schema.isPattern(/^\P{Cc}+$/u, {
    // JSON Schema 2020-12 §6.4: use portable ranges for Unicode control characters.
    toJsonSchema: () => ({ not: { pattern: "[\\u0000-\\u001f\\u007f-\\u009f]" } }),
  }),
);
