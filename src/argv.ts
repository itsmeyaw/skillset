import { Context, Option } from "effect";
import { Command, CommandSpec, GlobalFlag } from "effect/cli";

// Variadic flags expand by default; annotations define positional boundaries.
export const Expansion = Context.Service<
  never,
  {
    readonly accepts?: (value: string, agentIds: ReadonlyArray<string>) => boolean;
    readonly positional?: (value: string) => boolean;
    readonly reserveLast?: boolean;
    readonly blocksReserved?: boolean;
  }
>("skillset/argv/Expansion");

// Spec #1, User Stories 3 and 47: expand space-separated values for Effect CLI.
export const expandSkillFlags = (
  argv: ReadonlyArray<string>,
  agentIds: ReadonlyArray<string>,
  command: Command.Command.Any,
  builtIns: ReadonlyArray<GlobalFlag.GlobalFlag<any>> = GlobalFlag.BuiltIns,
): Array<string> => {
  const resolve = (path: ReadonlyArray<string>) =>
    Option.getOrThrow(CommandSpec.resolve(command, path, { builtIns }));
  let spec = resolve([command.name]);
  const allFlags = (current: CommandSpec.Spec): ReadonlyArray<CommandSpec.Flag> => [
    ...current.flags,
    ...current.subcommands.flatMap((subcommand) =>
      allFlags(resolve([...current.path, subcommand.name])),
    ),
  ];
  const fallbackFlags = allFlags(spec);
  const matches = (flag: CommandSpec.Flag, name: string) =>
    name === `--${flag.name}` ||
    flag.aliases.some((alias) => name === `${alias.length === 1 ? "-" : "--"}${alias}`);
  const rule = (flag: CommandSpec.Flag) =>
    Option.getOrUndefined(Context.getOption(flag.annotations, Expansion));
  const result: Array<string> = [];
  let flag: { token: string; spec: CommandSpec.Flag; local: boolean } | undefined;
  let hasValue = false;
  let rest = false;
  let commandSeen = false;
  let positionalSeen = false;
  let optionValue = false;
  let explicitSet = false;
  let skillsetIndex: number | undefined;
  const flush = () => {
    if (flag !== undefined && !hasValue) result.push(flag.token);
    flag = undefined;
  };
  for (const token of argv) {
    if (rest) {
      result.push(token);
      if (commandSeen) positionalSeen = true;
    } else if (token === "--") {
      flush();
      rest = true;
      result.push(token);
    } else if (token.startsWith("-")) {
      flush();
      hasValue = false;
      const name = token.split("=", 1)[0]!;
      const active = spec.flags.find((item) => matches(item, name));
      // Preserve expansion of known flags on commands where Effect will reject them.
      const found = active ?? fallbackFlags.find((item) => matches(item, name));
      const expansion = found && rule(found);
      optionValue = found !== undefined && found.type._tag !== "Boolean" && name === token;
      if (expansion?.blocksReserved) explicitSet = true;
      if (expansion?.reserveLast && active && name === token) skillsetIndex = undefined;
      if (found?.variadic && name === token) {
        flag = { token, spec: found, local: active !== undefined };
        optionValue = false;
      } else result.push(token);
    } else if (optionValue) {
      result.push(token);
      optionValue = false;
    } else if (flag?.local && !positionalSeen && rule(flag.spec)?.positional?.(token)) {
      flush();
      result.push(token);
      positionalSeen = true;
    } else if (flag && hasValue && rule(flag.spec)?.accepts?.(token, agentIds) === false) {
      flush();
      result.push(token);
      if (commandSeen) positionalSeen = true;
    } else if (flag !== undefined) {
      if (flag.local && rule(flag.spec)?.reserveLast && hasValue) skillsetIndex = result.length;
      result.push(flag.token, token);
      hasValue = true;
    } else {
      result.push(token);
      if (!commandSeen) {
        commandSeen = true;
        const subcommand = spec.subcommands.find(
          (item) => item.name === token || item.alias === token,
        );
        if (subcommand) spec = resolve([...spec.path, subcommand.name]);
      } else if (!positionalSeen) positionalSeen = true;
    }
  }
  flush();
  // Issue #24: the final space-separated skill value is ambiguous with a Skillset name.
  if (!positionalSeen && !explicitSet && skillsetIndex !== undefined)
    result.splice(skillsetIndex, 1);
  return result;
};
