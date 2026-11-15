// Spec #1, User Story 3: Effect CLI consumes one value per flag, so expand space-separated skills.
export const expandSkillFlags = (argv: ReadonlyArray<string>): Array<string> => {
  const result: Array<string> = [];
  let flag: string | undefined;
  let used = false;
  let rest = false;
  const flush = () => {
    if (flag !== undefined && !used) result.push(flag);
    flag = undefined;
  };
  for (const token of argv) {
    if (rest) result.push(token);
    else if (token === "--") {
      flush();
      rest = true;
      result.push(token);
    } else if (token.startsWith("-")) {
      flush();
      used = false;
      if (token === "-s" || token === "--skill") flag = token;
      else result.push(token);
    } else if (flag !== undefined) {
      result.push(flag, token);
      used = true;
    } else result.push(token);
  }
  flush();
  return result;
};
