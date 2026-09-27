import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { withJsonFileLock, writeJsonFileAtomic } from "./json-store.ts";

test("locked read-modify-write updates do not lose concurrent entries", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "trackkeep-json-store-"));
  const filePath = path.join(directory, "log.json");

  t.after(() => rm(directory, { force: true, recursive: true }));

  await writeJsonFileAtomic(filePath, { entries: [] });
  await Promise.all(
    Array.from({ length: 25 }, (_, index) =>
      withJsonFileLock(filePath, async () => {
        const log = JSON.parse(await readFile(filePath, "utf8")) as {
          entries: number[];
        };

        log.entries.push(index);
        await writeJsonFileAtomic(filePath, log);
      })
    )
  );

  const log = JSON.parse(await readFile(filePath, "utf8")) as { entries: number[] };

  assert.equal(log.entries.length, 25);
  assert.deepEqual(await readdir(directory), ["log.json"]);
});

test("a failed locked task does not block later tasks for the same file", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "trackkeep-json-store-"));
  const filePath = path.join(directory, "log.json");

  t.after(() => rm(directory, { force: true, recursive: true }));

  await assert.rejects(
    withJsonFileLock(filePath, async () => {
      throw new Error("boom");
    }),
    /boom/
  );
  assert.equal(await withJsonFileLock(filePath, async () => "next"), "next");
});
