import { isDeepStrictEqual } from "node:util";
import { Effect, FileSystem } from "effect";
import { applyEdits, modify, parse, printParseErrorCode, type ParseError } from "jsonc-parser";
import { writeFileAtomic } from "../atomic-write.ts";
import { CliMessageError } from "../errors.ts";
import type { McpInstallContext, McpOutcome } from "./agent.ts";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Match the file's own indentation and line ending for the entries we insert.
const formatting = (text: string) => {
  const indent = /^([ \t]+)\S/mu.exec(text)?.[1] ?? "  ";
  return {
    insertSpaces: !indent.startsWith("\t"),
    tabSize: indent.startsWith("\t") ? 1 : indent.length,
    eol: text.includes("\r\n") ? "\r\n" : "\n",
  };
};

// An Agent that accepts both `<base>.json` and `<base>.jsonc` is written to the file that exists, else `.json`.
export const existingJsonFile = Effect.fn("existingJsonFile")(function* (base: string) {
  const fs = yield* FileSystem.FileSystem;
  for (const extension of [".json", ".jsonc"])
    if (yield* fs.exists(base + extension).pipe(Effect.orElseSucceed(() => false)))
      return base + extension;
  return `${base}.json`;
});

// ADR 0007: add servers to a JSON or JSONC file in place, so comments and other settings survive.
// shortcut: edits are not merged across concurrent writers; a running Agent can still overwrite the file.
export const installJsonMcp = Effect.fn("installJsonMcp")(function* (
  file: string,
  // A function chooses the table from the file's content, for Agents with more than one layout.
  keyPathOf: ReadonlyArray<string> | ((root: Record<string, unknown>) => ReadonlyArray<string>),
  servers: ReadonlyArray<{ readonly name: string; readonly value: unknown }>,
  confirmOverwrite: McpInstallContext["confirmOverwrite"],
) {
  const fs = yield* FileSystem.FileSystem;
  const failure = (reason: string) =>
    new CliMessageError({
      message: `Cannot update ${file}: ${reason}; the file was left untouched.`,
    });
  const exists = yield* fs.exists(file).pipe(Effect.mapError((error) => failure(error.message)));
  const original = exists
    ? yield* fs.readFileString(file).pipe(Effect.mapError((error) => failure(error.message)))
    : "";
  let text = original.trim() === "" ? "{}" : original;
  const errors: Array<ParseError> = [];
  const root: unknown = parse(text, errors, { allowTrailingComma: true });
  if (errors.length > 0)
    return yield* failure(
      `invalid JSON (${printParseErrorCode(errors[0]!.error)} at offset ${errors[0]!.offset})`,
    );
  if (!isObject(root)) return yield* failure("it does not hold a JSON object");
  const keyPath = typeof keyPathOf === "function" ? keyPathOf(root) : keyPathOf;
  let table: unknown = root;
  for (const [index, key] of keyPath.entries()) {
    table = isObject(table) ? table[key] : undefined;
    if (table !== undefined && !isObject(table))
      return yield* failure(`"${keyPath.slice(0, index + 1).join(".")}" is not a JSON object`);
  }
  const existing = isObject(table) ? table : {};
  const outcomes: Array<McpOutcome> = [];
  const put = (name: string, value: unknown) => {
    text = applyEdits(
      text,
      modify(text, [...keyPath, name], value, { formattingOptions: formatting(text) }),
    );
    return "written" as const;
  };
  for (const { name, value } of servers) {
    const current = Object.hasOwn(existing, name) ? existing[name] : undefined;
    const status =
      current === undefined
        ? put(name, value)
        : isDeepStrictEqual(current, value)
          ? "unchanged"
          : (yield* confirmOverwrite({ name, file, existing: current, next: value }))
            ? put(name, value)
            : "kept";
    outcomes.push({ name, file, status });
  }
  if (text !== original)
    yield* writeFileAtomic(file, exists ? text : `${text}\n`).pipe(
      Effect.mapError(
        (error) => new CliMessageError({ message: `Cannot write ${file}: ${error.message}` }),
      ),
    );
  return outcomes;
});
