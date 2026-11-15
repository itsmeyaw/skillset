import { ambiguousTreeMessage } from "./errors.ts";
import { PIN_PATTERN } from "./pin.ts";

export type ParsedSource = {
  readonly stored: string;
  readonly remote: string;
  readonly ref: string | undefined;
  readonly fixed: boolean;
  readonly skill: string | undefined;
  readonly treeRefs?: ReadonlyArray<string>;
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

// RFC 3986 §3: parse HTTP Sources as URLs before classifying their paths.
const validateHttpSource = (source: string): { readonly error: string } | undefined => {
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
    // RFC 8615 §3: well-known endpoints are not Git repositories.
    if (url.pathname === "/" || /(?:^|\/)\.well-known(?:\/|$)/u.test(url.pathname)) {
      return { error: "Well-known URLs cannot be pinned; use a remote Git Source." };
    }
  }
  return undefined;
};

const parseTree = (source: string): ParsedSource | { readonly error: string } | undefined => {
  // Spec #1, Source parsing: a tree path selects a skill, but is not part of the stored Source.
  const tree =
    /^(https?:\/\/github\.com\/[^/\s?#]+\/[^/\s?#]+)\/tree\/([^/\s?#]+)(?:\/([^\s?#]+?))?\/?$/u.exec(
      source,
    );
  if (tree) {
    // RFC 3986 §2.2: an encoded slash cannot safely identify the tree ref boundary.
    if (/%2f/iu.test(tree[2]!)) return { error: ambiguousTreeMessage };
    // skills@1.8.1 parseSource: tree URL path segments are not percent-decoded.
    return {
      stored: `${tree[1]}/tree/${tree[2]}`,
      remote: tree[1]!,
      ref: tree[2]!,
      fixed: false,
      skill: tree[3]?.split("/").at(-1),
      treeRefs: tree[3]
        ? tree[3]
            .split("/")
            .map((_, index, parts) => [tree[2]!, ...parts.slice(0, index + 1)].join("/"))
        : [],
    };
  }
  return undefined;
};

const parsePinned = (source: string): ParsedSource | undefined => {
  // skills@1.8.1 isVersionPin: only versions or full commit SHAs are fixed refs.
  const pinned = /^([a-zA-Z0-9][a-zA-Z0-9-]*\/[a-zA-Z0-9_.-]+)@([^@\s]+)$/u.exec(source);
  if (
    pinned &&
    !pinned[1]!.endsWith("/.") &&
    !pinned[1]!.endsWith("/..") &&
    (/^v?\d+(?:\.\d+)+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(pinned[2]!) ||
      PIN_PATTERN.test(pinned[2]!.toLowerCase()))
  ) {
    return {
      stored: source,
      remote: pinned[1]!,
      // Spec #1, Skillset file format: Pins use lowercase hexadecimal.
      ref: PIN_PATTERN.test(pinned[2]!.toLowerCase()) ? pinned[2]!.toLowerCase() : pinned[2],
      fixed: true,
      skill: undefined,
    };
  }
  return undefined;
};

const parseRemote = (source: string): ParsedSource | undefined => {
  // Spec #1, User Story 11: pass remote Git URLs through to git ls-remote.
  const remote =
    /^((?:(?:https?|ssh|git|ftp|ftps):\/\/|(?:[^\s/@:]+@)?[^\s/:]+:)[^\s#]+)(?:#([^#@\s]+))?$/iu.exec(
      source,
    );
  if (remote) {
    return {
      stored: source,
      remote: remote[1]!,
      ref: decodeRef(remote[2]),
      fixed: false,
      skill: undefined,
    };
  }
  return undefined;
};

// skills@1.8.1 parseSource: owner/name is GitHub shorthand.
const parseShorthand = (source: string): ParsedSource | { readonly error: string } => {
  const match = /^([a-zA-Z0-9][a-zA-Z0-9-]*\/[a-zA-Z0-9_.-]+)(?:#([^#@\s]+))?$/u.exec(source);
  if (!match || match[1]?.endsWith("/.") || match[1]?.endsWith("/..")) {
    return { error: "Invalid or unsupported Source; use a remote Git Source." };
  }
  return {
    stored: source,
    remote: match[1]!,
    ref: decodeRef(match[2]),
    fixed: false,
    skill: undefined,
  };
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
  const rejected = validateHttpSource(source);
  if (rejected) return rejected;
  const typed = parseTree(source) ?? parsePinned(source);
  if (typed) return typed;
  // Spec #1, User Story 9: skill filters must use -s, not @.
  const filter =
    /#[^#@\s]*@([^@\s]+)$/u.exec(source) ?? /^[^/\s]+\/[^/@\s]+@([^@\s]+)$/u.exec(source);
  if (filter) return { error: `Use -s ${filter[1]} to select a skill instead of @.` };
  return parseRemote(source) ?? parseShorthand(source);
};
