import { getSupportedAgents } from "skills";

// Spec #1, User Stories 3 and 47: expand space-separated skills and agents for Effect CLI.
export const expandSkillFlags = (argv: ReadonlyArray<string>): Array<string> => {
  const result: Array<string> = [];
  let flag: string | undefined;
  let hasValue = false;
  let rest = false;
  let adding = false;
  let installing = false;
  let commandSeen = false;
  let positionalSeen = false;
  let optionValue = false;
  let explicitSet = false;
  let skillsetIndex: number | undefined;
  const flush = () => {
    if (flag !== undefined && !hasValue) result.push(flag);
    flag = undefined;
  };
  for (const token of argv) {
    if (rest) {
      result.push(token);
      if (installing) positionalSeen = true;
    }
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
      if (token === "--set" || token.startsWith("--set=")) explicitSet = true;
      if (token === "-s" || token === "--skill") skillsetIndex = undefined;
      if (token === "-s" || token === "--skill" || token === "-a" || token === "--agent")
        flag = token;
      else result.push(token);
    } else if (optionValue) {
      result.push(token);
      optionValue = false;
    } else if (flag !== undefined && adding && !positionalSeen && /[/:]/u.test(token)) {
      // Spec #1, User Story 3: a Source can follow space-separated skill names.
      flush();
      result.push(token);
      positionalSeen = true;
    } else if (
      (flag === "-a" || flag === "--agent") &&
      hasValue &&
      !getSupportedAgents().some((agent) => agent.id === token)
    ) {
      // Issue #13: only supported agent IDs extend a space-separated agent flag.
      flush();
      result.push(token);
      if (adding || installing) positionalSeen = true;
    } else if (flag !== undefined) {
      if (installing && (flag === "-s" || flag === "--skill") && hasValue)
        skillsetIndex = result.length;
      result.push(flag, token);
      hasValue = true;
    } else {
      result.push(token);
      // Issue #11: only the subcommand enables Source detection after skill flags.
      if (!commandSeen) {
        commandSeen = true;
        adding = ["add", "a"].includes(token);
        installing = ["install", "i"].includes(token);
      } else if ((adding || installing) && !positionalSeen) positionalSeen = true;
    }
  }
  flush();
  // Issue #24: the final space-separated skill value is ambiguous with a Skillset name.
  if (installing && !positionalSeen && !explicitSet && skillsetIndex !== undefined)
    result.splice(skillsetIndex, 1);
  return result;
};
