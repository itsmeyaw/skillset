export type ParsedSource = {
  readonly stored: string;
  readonly repository: string;
  readonly ref: string | undefined;
  readonly fixed: boolean;
  readonly skill: string | undefined;
};

// Spec #1, Source parsing module: retain the typed Source and separate the lookup ref.
export const parseSource = (source: string): ParsedSource | { readonly error: string } => {
  // skills@1.8.1 isVersionPin: only versions or full commit SHAs are fixed refs.
  const pinned =
    /^([a-zA-Z0-9][a-zA-Z0-9-]*\/[a-zA-Z0-9_.-]+)@(v?\d+(?:\.\d+)+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?|[a-fA-F0-9]{40})$/u.exec(
      source,
    );
  if (pinned && !pinned[1]!.endsWith("/.") && !pinned[1]!.endsWith("/..")) {
    return {
      stored: source,
      repository: pinned[1]!,
      ref: pinned[2],
      fixed: true,
      skill: undefined,
    };
  }
  // Spec #1, User Story 9: skill filters must use -s, not @.
  const filter = /^[^/\s]+\/[^/@\s]+(?:#[^@\s]*)?@([^@\s]+)$/u.exec(source);
  if (filter) return { error: `Use -s ${filter[1]} to select a skill instead of @.` };
  const match = /^([a-zA-Z0-9][a-zA-Z0-9-]*\/[a-zA-Z0-9_.-]+)(?:#([^#@\s]+))?$/u.exec(source);
  if (!match || match[1]?.endsWith("/.") || match[1]?.endsWith("/..")) {
    // shortcut: only simple GitHub Sources are supported until ticket #5 extends parsing.
    return { error: `Source not supported yet: ${source}` };
  }
  return { stored: source, repository: match[1]!, ref: match[2], fixed: false, skill: undefined };
};
