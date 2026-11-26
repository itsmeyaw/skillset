import { randomBytes } from "node:crypto";
import { dirname } from "node:path";
import { Effect, FileSystem } from "effect";

// Issue #12: create missing parent directories so a first write to a new directory works.
export const writeFileAtomic = Effect.fn("writeFileAtomic")(function* (
  linkPath: string,
  content: string,
) {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.makeDirectory(dirname(linkPath), { recursive: true });
  // POSIX rename(2) replaces a symlink itself, so write through to its target.
  const path = (yield* fs.exists(linkPath)) ? yield* fs.realPath(linkPath) : linkPath;
  // A unique name in the same directory keeps rename atomic and lets a leftover file never block a write.
  const tmp = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  // POSIX chmod(2): retain existing access permissions when replacing the file.
  const mode = (yield* fs.exists(path)) ? (yield* fs.stat(path)).mode & 0o7777 : undefined;
  // POSIX open(2): O_EXCL prevents following or sharing an existing temporary file.
  yield* Effect.gen(function* () {
    yield* fs.writeFileString(tmp, content, { flag: "wx", mode });
    if (mode !== undefined) yield* fs.chmod(tmp, mode);
    // POSIX rename(2): replacing a file atomically exposes either the old or new content.
    yield* fs.rename(tmp, path);
  }).pipe(Effect.onError(() => Effect.ignore(fs.remove(tmp, { force: true }))));
});
