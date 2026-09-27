import { randomBytes } from "crypto";
import { rename, rm, writeFile } from "fs/promises";
import path from "path";

const fileQueues = new Map<string, Promise<unknown>>();

// Writes to a unique sibling temp file, then renames over the target, so a
// crash or a concurrent reader never observes a half-written JSON file.
export async function writeJsonFileAtomic(filePath: string, value: unknown) {
  const temporaryPath = path.join(
    /* turbopackIgnore: true */ path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`
  );

  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, {
      force: true
    }).catch(() => undefined);

    throw error;
  }
}

// Serializes read-modify-write updates per file so concurrent jobs (single
// downloads, bulk jobs, organize, scans) cannot drop each other's changes.
export function withJsonFileLock<T>(filePath: string, task: () => Promise<T>) {
  const key = path.resolve(/* turbopackIgnore: true */ filePath);
  const previous = fileQueues.get(key) ?? Promise.resolve();
  const next = previous.then(task, task);
  const settled = next.catch(() => undefined);

  fileQueues.set(key, settled);
  void settled.then(() => {
    if (fileQueues.get(key) === settled) {
      fileQueues.delete(key);
    }
  });

  return next;
}
