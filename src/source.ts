export type ParsedSource = {
  readonly stored: string;
  readonly repository: string;
  readonly ref: string | undefined;
  readonly fixed: boolean;
  readonly skill: string | undefined;
};

// skills@1.8.1 decodeFragmentValue: retain malformed escapes as literal refs.
const decodeRef = (ref: string | undefined): string | undefined => {
  if (ref === undefined) return undefined;
  try {
    return decodeURIComponent(ref);
  } catch {
    return ref;
  }
};

// Spec #1, Source parsing module: retain the typed Source and separate the lookup ref.
export const parseSource = (source: string): ParsedSource | { readonly error: string } => {
  // Spec #1, User Story 12: local paths cannot be pinned to a remote commit.
  if (/^(?:\.{1,2}(?:[/\\]|$)|~(?:[/\\]|$)|[/\\]|[a-z]:[/\\]|file:)/iu.test(source)) {
    return { error: "Local paths cannot be pinned; use a remote Git Source." };
  }
  if (/\s/u.test(source)) return { error: "Invalid Source: whitespace is not allowed." };
  // skills@1.8.1 parseSource: github: and gitlab: are repository aliases.
  const alias = /^(github|gitlab):(.+)$/u.exec(source);
  if (alias) {
    const parsed = parseSource(
      alias[1] === "github" ? alias[2]! : `https://gitlab.com/${alias[2]}`,
    );
    return "error" in parsed ? parsed : { ...parsed, stored: source };
  }
  if (/^https?:\/\//iu.test(source)) {
    let url: URL;
    try {
      url = new URL(source);
    } catch {
      return { error: "Invalid Source URL." };
    }
    // skills@1.8.1 isHostedArtifactUrl: downloads are not Git repositories.
    if (
      [
        "raw.githubusercontent.com",
        "codeload.github.com",
        "objects.githubusercontent.com",
      ].includes(url.hostname) ||
      (url.hostname === "github.com" &&
        /^\/[^/]+\/[^/]+\/(?:archive|raw|releases\/(?:download|latest\/download))\//u.test(
          url.pathname,
        )) ||
      /\/-\/(?:archive|raw)\//u.test(url.pathname) ||
      /\/SKILL\.md$/iu.test(url.pathname) ||
      /\.(?:zip|tar|tar\.gz|tgz)$/iu.test(url.pathname)
    )
      return { error: "Direct download URLs cannot be pinned; use a remote Git Source." };
    // Spec #1, User Story 12: well-known endpoints are not Git repositories.
    if (url.pathname === "/" || /(?:^|\/)\.well-known(?:\/|$)/u.test(url.pathname)) {
      return { error: "Well-known URLs cannot be pinned; use a remote Git Source." };
    }
  }
  // Spec #1, Source parsing: a tree path selects a skill, but is not part of the stored Source.
  const tree =
    /^(https?:\/\/github\.com\/[^/\s?#]+\/[^/\s?#]+)\/tree\/([^/\s?#]+)(?:\/([^\s?#]+?))?\/?$/u.exec(
      source,
    );
  if (tree) {
    try {
      // RFC 3986 §2.1: decode percent-encoded URL components for lookup.
      return {
        stored: `${tree[1]}/tree/${tree[2]}`,
        repository: tree[1]!,
        ref: decodeURIComponent(tree[2]!),
        fixed: false,
        skill: tree[3] ? decodeURIComponent(tree[3].split("/").at(-1)!) : undefined,
      };
    } catch {
      return { error: `Invalid URL encoding in Source: ${source}` };
    }
  }
  // skills@1.8.1 isVersionPin: only versions or full commit SHAs are fixed refs.
  const pinned =
    /^([a-zA-Z0-9][a-zA-Z0-9-]*\/[a-zA-Z0-9_.-]+)@(v?\d+(?:\.\d+)+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?|[a-fA-F0-9]{40})$/u.exec(
      source,
    );
  if (pinned && !pinned[1]!.endsWith("/.") && !pinned[1]!.endsWith("/..")) {
    return {
      stored: source,
      repository: pinned[1]!,
      // Spec #1, Skillset file format: Pins use lowercase hexadecimal.
      ref: /^[a-f0-9]{40}$/iu.test(pinned[2]!) ? pinned[2]!.toLowerCase() : pinned[2],
      fixed: true,
      skill: undefined,
    };
  }
  // Spec #1, User Story 9: skill filters must use -s, not @.
  const filter =
    /#[^#@\s]*@([^@\s]+)$/u.exec(source) ?? /^[^/\s]+\/[^/@\s]+@([^@\s]+)$/u.exec(source);
  if (filter) return { error: `Use -s ${filter[1]} to select a skill instead of @.` };
  // Spec #1, User Story 11: pass remote Git URLs through to git ls-remote.
  const remote =
    /^((?:(?:https?|ssh|git|ftp|ftps):\/\/|(?:[^\s/@:]+@)?[^\s/:]+:)[^\s#]+)(?:#([^#@\s]+))?$/iu.exec(
      source,
    );
  if (remote) {
    return {
      stored: source,
      repository: remote[1]!,
      ref: decodeRef(remote[2]),
      fixed: false,
      skill: undefined,
    };
  }
  const match = /^([a-zA-Z0-9][a-zA-Z0-9-]*\/[a-zA-Z0-9_.-]+)(?:#([^#@\s]+))?$/u.exec(source);
  if (!match || match[1]?.endsWith("/.") || match[1]?.endsWith("/..")) {
    return { error: "Invalid or unsupported Source; use a remote Git Source." };
  }
  return {
    stored: source,
    repository: match[1]!,
    ref: decodeRef(match[2]),
    fixed: false,
    skill: undefined,
  };
};
