// Spec #1, User Stories 3 and 47: expand space-separated skills and agents for Effect CLI.
export const expandSkillFlags = (argv: ReadonlyArray<string>): Array<string> => {
  const result: Array<string> = [];
  let flag: string | undefined;
  let hasValue = false;
  let rest = false;
  let adding = false;
  let sourceSeen = false;
  let setValue = false;
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
      setValue = token === "--set";
      if (token === "-s" || token === "--skill" || token === "-a" || token === "--agent")
        flag = token;
      else result.push(token);
    } else if (setValue) {
      result.push(token);
      setValue = false;
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
      // Spec #11: Source arguments follow skill flags for both add and install.
      if (["add", "a", "install", "i"].includes(token) && !adding) adding = true;
      else if (adding && !sourceSeen) sourceSeen = true;
    }
  }
  flush();
  return result;
};
