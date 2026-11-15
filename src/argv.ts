// Spec #1, User Stories 3 and 47: expand space-separated skills and agents for Effect CLI.
export const expandSkillFlags = (argv: ReadonlyArray<string>): Array<string> => {
  const result: Array<string> = [];
  let flag: string | undefined;
  let hasValue = false;
  let rest = false;
  let adding = false;
  let commandSeen = false;
  let sourceSeen = false;
  let optionValue = false;
  const flush = () => {
    if (flag !== undefined && !hasValue) result.push(flag);
    flag = undefined;
  };
  for (const token of argv) {
    if (rest) result.push(token);
    // POSIX Utility Syntax Guidelines, guideline 10: -- ends option processing.
    else if (token === "--") {
      flush();
      rest = true;
      result.push(token);
    } else if (token.startsWith("-")) {
      flush();
      hasValue = false;
      // Effect CLI: these shared/global flags consume the next token as their value.
      optionValue = ["--set", "--log-level", "--completions"].includes(token);
      if (token === "-s" || token === "--skill" || token === "-a" || token === "--agent")
        flag = token;
      else result.push(token);
    } else if (optionValue) {
      result.push(token);
      optionValue = false;
    } else if (flag !== undefined && adding && !sourceSeen && /[/:]/u.test(token)) {
      // Spec #1, User Story 3: a Source can follow space-separated skill names.
      flush();
      result.push(token);
      sourceSeen = true;
    } else if (flag !== undefined) {
      result.push(flag, token);
      hasValue = true;
    } else {
      result.push(token);
      // Issue #11: only the subcommand enables Source detection after skill flags.
      if (!commandSeen) {
        commandSeen = true;
        adding = ["add", "a", "install", "i"].includes(token);
      } else if (adding && !sourceSeen) sourceSeen = true;
    }
  }
  flush();
  return result;
};
