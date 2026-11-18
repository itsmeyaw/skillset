import { dirname } from "node:path";
import { Effect, FileSystem } from "effect";

// Issue #12: create missing parent directories so a first write to a new directory works.
export const writeFileAtomic = Effect.fn("writeFileAtomic")(function* (
  path: string,
  content: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const tmp = `${path}.tmp`;
  yield* fs.makeDirectory(dirname(path), { recursive: true });
  // POSIX chmod(2): retain existing access permissions when replacing the file.
  const mode = (yield* fs.exists(path)) ? (yield* fs.stat(path)).mode & 0o7777 : undefined;
  // POSIX open(2): O_EXCL prevents following or sharing an existing temporary file.
  // shortcut: stale temporary files block saves; use unique names to allow retries.
  yield* fs.writeFileString(tmp, content, { flag: "wx", mode });
  if (mode !== undefined) yield* fs.chmod(tmp, mode);
  // POSIX rename(2): replacing a file atomically exposes either the old or new content.
  yield* fs.rename(tmp, path);
});
