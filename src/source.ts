export type ParsedSource = {
  readonly stored: string;
  readonly repository: string;
  readonly ref: string | undefined;
  readonly fixed: boolean;
  readonly skill: string | undefined;
};

// Spec #1, Source parsing module: retain the typed Source and separate the lookup ref.
export const parseSource = (source: string): ParsedSource | { readonly error: string } => {
  const match = /^([a-zA-Z0-9][a-zA-Z0-9-]*\/[a-zA-Z0-9_.-]+)(?:#([^#@\s]+))?$/u.exec(source);
  if (!match || match[1]?.endsWith("/.") || match[1]?.endsWith("/..")) {
    // shortcut: only simple GitHub Sources are supported until ticket #5 extends parsing.
    return { error: `Source not supported yet: ${source}` };
  }
  return { stored: source, repository: match[1]!, ref: match[2], fixed: false, skill: undefined };
};
