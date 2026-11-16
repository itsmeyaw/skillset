import { homedir } from "node:os";
import { join } from "node:path";
import { Effect, FileSystem, Option } from "effect";
import { CliMessageError } from "./errors.ts";

// Issue #12: a bare name starts alphanumeric; ADR 0002 keeps `.json` values as paths.
const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/u;
// ADR 0002: names resolve to lowercase `.json` files, so ls --user lists only those.
const EXT = ".json";
const isJsonPath = (value: string) => /\.json$/iu.test(value);

export const isUserSkillsetName = (value: string) => NAME_PATTERN.test(value) && !isJsonPath(value);

type Env = Readonly<Record<string, string | undefined>>;

// XDG Base Directory Specification: an empty variable counts as unset.
const nonEmpty = (value: string | undefined) =>
  value === undefined || value === "" ? undefined : value;

// ADR 0002: SKILLSET_HOME, else $XDG_CONFIG_HOME/skillset, else ~/.skillset; never merged.
export const userDir = (env: Env = process.env): string => {
  const home = nonEmpty(env.SKILLSET_HOME);
  if (home !== undefined) return home;
  const xdg = nonEmpty(env.XDG_CONFIG_HOME);
  return xdg === undefined ? join(homedir(), ".skillset") : join(xdg, "skillset");
};

// ADR 0002: the form of `--set` alone decides path versus User Skillset.
export const resolveSet = (
  value: Option.Option<string>,
  env: Env = process.env,
): Effect.Effect<string, CliMessageError> => {
  if (Option.isNone(value)) return Effect.succeed("./skillset.json");
  if (isJsonPath(value.value)) return Effect.succeed(value.value);
  if (NAME_PATTERN.test(value.value))
    return Effect.succeed(join(userDir(env), `${value.value}${EXT}`));
  return Effect.fail(
    new CliMessageError({ message: `"${value.value}" is not a Skillset name or .json path.` }),
  );
};

// Issue #22: ls --user shows names only; a missing user directory is not an error.
export const listUserSkillsets = Effect.fn("listUserSkillsets")(function* (env: Env = process.env) {
  const fs = yield* FileSystem.FileSystem;
  const dir = userDir(env);
  const failure = (error: { readonly message: string }) =>
    new CliMessageError({ message: `Cannot read ${dir}: ${error.message}` });
  if (!(yield* fs.exists(dir).pipe(Effect.mapError(failure)))) return [];
  const files = yield* fs.readDirectory(dir).pipe(Effect.mapError(failure));
  return files
    .filter((file) => file.endsWith(EXT))
    .map((file) => file.slice(0, -EXT.length))
    .filter(isUserSkillsetName)
    .sort();
});
