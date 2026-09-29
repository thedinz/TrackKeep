import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createAppSessionCookie, verifyAppSessionCookie } from "./app-auth.ts";
import { createHmac } from "node:crypto";

test("placeholder app secrets are replaced by a generated persisted secret", async (t) => {
  const configDirectory = await mkdtemp(path.join(tmpdir(), "trackkeep-app-auth-"));
  const previousConfigDirectory = process.env.TRACKKEEP_CONFIG_DIR;
  const previousSecret = process.env.TRACKKEEP_APP_SECRET;

  t.after(async () => {
    restoreEnvironmentValue("TRACKKEEP_CONFIG_DIR", previousConfigDirectory);
    restoreEnvironmentValue("TRACKKEEP_APP_SECRET", previousSecret);
    await rm(configDirectory, { force: true, recursive: true });
  });

  process.env.TRACKKEEP_CONFIG_DIR = configDirectory;
  process.env.TRACKKEEP_APP_SECRET = "change-this-to-a-long-random-value";

  const cookie = createAppSessionCookie("admin");
  const [payload] = cookie.split(".");
  const forgedSignature = createHmac("sha256", "change-this-to-a-long-random-value")
    .update(payload)
    .digest("base64url");
  const storedSecret = (
    await readFile(path.join(configDirectory, "app-secret"), "utf8")
  ).trim();

  assert.ok(verifyAppSessionCookie(cookie));
  assert.equal(verifyAppSessionCookie(`${payload}.${forgedSignature}`), null);
  assert.ok(storedSecret.length >= 32);
});

function restoreEnvironmentValue(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
