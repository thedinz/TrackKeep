import assert from "node:assert/strict";
import test from "node:test";
import {
  getLoginRetryAfterSeconds,
  recordLoginFailure,
  recordLoginSuccess
} from "./login-throttle.ts";

test("login throttle locks out after repeated failures and backs off", () => {
  const start = 1_000_000;

  recordLoginSuccess();

  for (let attempt = 0; attempt < 4; attempt += 1) {
    recordLoginFailure(start);
  }

  assert.equal(getLoginRetryAfterSeconds(start), 0);

  recordLoginFailure(start);
  assert.equal(getLoginRetryAfterSeconds(start), 30);

  recordLoginFailure(start + 30_000);
  assert.equal(getLoginRetryAfterSeconds(start + 30_000), 60);
  assert.equal(getLoginRetryAfterSeconds(start + 90_000), 0);
});

test("login throttle resets after success and after the failure window", () => {
  const start = 5_000_000;

  recordLoginSuccess();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    recordLoginFailure(start);
  }

  recordLoginSuccess();
  assert.equal(getLoginRetryAfterSeconds(start), 0);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    recordLoginFailure(start);
  }

  recordLoginFailure(start + 16 * 60_000);
  assert.equal(getLoginRetryAfterSeconds(start + 16 * 60_000), 0);
  recordLoginSuccess();
});
