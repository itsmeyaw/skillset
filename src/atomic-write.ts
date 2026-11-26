import { randomBytes } from "node:crypto";
import { dirname } from "node:path";
import { Effect, FileSystem, Option, Schedule } from "effect";
import type { PlatformError } from "effect/PlatformError";
import { CliMessageError } from "./errors.ts";

const LOCK_ATTEMPTS = 50;
const LOCK_WAIT = "100 millis";
const LOCK_STALE_MS = 30_000;

const isAlreadyExists = (error: PlatformError) => error.reason._tag === "AlreadyExists";

// shortcut: a lock older than 30 s is removed without an owner check, so two runs taking over the same stale lock can both proceed; store an owner id in the lock if that matters.
const removeIfStale = (fs: FileSystem.FileSystem, lock: string) =>
  fs.stat(lock).pipe(
    Effect.flatMap((info) =>
      Option.exists(info.mtime, (mtime) => Date.now() - mtime.getTime() > LOCK_STALE_MS)
        ? fs.remove(lock, { recursive: true, force: true }).pipe(Effect.as(true))
        : Effect.succeed(false),
    ),
    Effect.orElseSucceed(() => false),
  );

// POSIX mkdir(2): creating a directory is atomic and fails when it exists, so it works as a lock.
const acquireLock = (fs: FileSystem.FileSystem, lock: string): Effect.Effect<void, PlatformError> =>
  fs.makeDirectory(lock).pipe(
    Effect.catchIf(isAlreadyExists, (error) =>
      removeIfStale(fs, lock).pipe(
        Effect.flatMap((removed) => (removed ? acquireLock(fs, lock) : Effect.fail(error))),
      ),
    ),
    Effect.retry({
      schedule: Schedule.spaced(LOCK_WAIT),
      times: LOCK_ATTEMPTS,
      while: isAlreadyExists,
    }),
  );

// Issue #12: create missing parent directories so a first write to a new directory works.
// Issue #107: `expected` is the text the caller read (null: the file was absent). Under a lock the file is
// read again, and a write over text the caller never saw fails instead of losing the other run's edit.
export const writeFileAtomic = Effect.fn("writeFileAtomic")(function* (
  linkPath: string,
  content: string,
  expected: string | null,
) {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.makeDirectory(dirname(linkPath), { recursive: true });
  // POSIX rename(2) replaces a symlink itself, so write through to its target.
  const path = (yield* fs.exists(linkPath)) ? yield* fs.realPath(linkPath) : linkPath;
  const lock = `${path}.lock`;
  yield* Effect.acquireUseRelease(
    acquireLock(fs, lock).pipe(
      Effect.mapError((error) =>
        isAlreadyExists(error)
          ? new CliMessageError({
              message: `${lock} is held by another skillset run. Delete it if no run is active.`,
            })
          : error,
      ),
    ),
    () =>
      Effect.gen(function* () {
        const current = (yield* fs.exists(path)) ? yield* fs.readFileString(path) : null;
        if (current !== expected)
          return yield* new CliMessageError({
            message: "it changed since it was read (another skillset run?). Run the command again.",
          });
        // A unique name in the same directory keeps rename atomic and lets a leftover file never block a write.
        const tmp = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
        // POSIX chmod(2): retain existing access permissions when replacing the file.
        const mode = current === null ? undefined : (yield* fs.stat(path)).mode & 0o7777;
        // POSIX open(2): O_EXCL prevents following or sharing an existing temporary file.
        yield* Effect.gen(function* () {
          yield* fs.writeFileString(tmp, content, { flag: "wx", mode });
          if (mode !== undefined) yield* fs.chmod(tmp, mode);
          // POSIX rename(2): replacing a file atomically exposes either the old or new content.
          yield* fs.rename(tmp, path);
        }).pipe(Effect.onError(() => Effect.ignore(fs.remove(tmp, { force: true }))));
      }),
    () => Effect.ignore(fs.remove(lock, { recursive: true, force: true })),
  );
});
