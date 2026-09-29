// Slows password guessing against the built-in login. Failures are counted
// globally rather than per client IP because forwarded IP headers are
// client-controlled and, behind a reverse proxy, every client shares one IP.
const freeAttempts = 5;
const baseLockoutMs = 30_000;
const maxLockoutMs = 15 * 60_000;
const failureWindowMs = 15 * 60_000;

let consecutiveFailures = 0;
let lastFailureAt = 0;
let lockedUntil = 0;

export function getLoginRetryAfterSeconds(now = Date.now()) {
  return lockedUntil > now ? Math.ceil((lockedUntil - now) / 1000) : 0;
}

export function recordLoginFailure(now = Date.now()) {
  if (now - lastFailureAt > failureWindowMs) {
    consecutiveFailures = 0;
  }

  consecutiveFailures += 1;
  lastFailureAt = now;

  if (consecutiveFailures >= freeAttempts) {
    const lockoutMs = Math.min(
      baseLockoutMs * 2 ** (consecutiveFailures - freeAttempts),
      maxLockoutMs
    );

    lockedUntil = now + lockoutMs;
  }
}

export function recordLoginSuccess() {
  consecutiveFailures = 0;
  lastFailureAt = 0;
  lockedUntil = 0;
}
