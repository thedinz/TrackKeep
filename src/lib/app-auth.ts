import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import path from "path";
import { shouldUseSecureCookies } from "./cookies";
import { getTrackKeepEnvironmentValue } from "./trackkeep-env";

export const APP_AUTH_COOKIE = "spotifybu_app_session";

export type AppAuthMode = "external" | "internal";

const defaultUsername = "admin";
const defaultPassword = "admin";
const sessionDurationSeconds = 60 * 60 * 24 * 7;

type StoredCredentials = {
  authMode?: AppAuthMode;
  defaultCredentials?: boolean;
  password: {
    algorithm: "scrypt";
    hash: string;
    salt: string;
  };
  updatedAt: string;
  username: string;
  version: 1;
};

type CredentialState =
  | {
      credentials: StoredCredentials;
      authMode: AppAuthMode;
      defaultCredentials: false;
      username: string;
    }
  | {
      authMode: AppAuthMode;
      defaultCredentials: true;
      username: string;
    };

export type AppAuthSession = {
  expiresAt: number;
  username: string;
};

export type AppAuthStatus = {
  authenticated: boolean;
  authMode: AppAuthMode;
  defaultCredentials: boolean;
  username?: string;
};

type CookieRequest = Parameters<typeof shouldUseSecureCookies>[0];

function cookieOptions(request?: CookieRequest) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: shouldUseSecureCookies(request),
    path: "/"
  };
}

export async function getAppAuthStatus() {
  const [session, credentialState] = await Promise.all([
    readAppSession(),
    readCredentialState()
  ]);

  return {
    authenticated: credentialState.authMode === "external" || Boolean(session),
    authMode: credentialState.authMode,
    defaultCredentials: credentialState.defaultCredentials,
    username:
      credentialState.authMode === "external"
        ? "External auth"
        : session?.username ?? credentialState.username
  } satisfies AppAuthStatus;
}

export async function getAppAuthMode() {
  return (await readCredentialState()).authMode;
}

export async function verifyAppCredentials(username: string, password: string) {
  const credentialState = await readCredentialState();

  if (credentialState.authMode === "external") {
    return false;
  }

  if (credentialState.defaultCredentials) {
    return username === defaultUsername && password === defaultPassword;
  }

  const expectedHash = scryptPassword(password, credentialState.credentials.password.salt);

  return safeEqual(expectedHash, credentialState.credentials.password.hash) &&
    username === credentialState.credentials.username;
}

export async function updateAppCredentials({
  currentPassword,
  newPassword,
  username
}: {
  currentPassword: string;
  newPassword: string;
  username: string;
}) {
  const credentialState = await readCredentialState();
  const currentUsername = credentialState.username;
  const currentPasswordValid = await verifyAppCredentials(
    currentUsername,
    currentPassword
  );

  if (!currentPasswordValid) {
    throw new Error("Current password is incorrect.");
  }

  const cleanUsername = username.trim();

  if (cleanUsername.length < 3) {
    throw new Error("Username must be at least 3 characters.");
  }

  if (newPassword.length < 8) {
    throw new Error("New password must be at least 8 characters.");
  }

  const salt = randomBytes(16).toString("base64url");
  const credentials = {
    authMode: credentialState.authMode,
    defaultCredentials: false,
    password: {
      algorithm: "scrypt",
      hash: scryptPassword(newPassword, salt),
      salt
    },
    updatedAt: new Date().toISOString(),
    username: cleanUsername,
    version: 1
  } satisfies StoredCredentials;

  await writeCredentials(credentials);

  return {
    authMode: credentialState.authMode,
    defaultCredentials: false,
    username: cleanUsername
  };
}

export async function updateAppAuthMode(authMode: string) {
  const nextAuthMode = normalizeAppAuthMode(authMode);
  const credentialState = await readCredentialState();

  if (credentialState.defaultCredentials) {
    await writeCredentials({
      authMode: nextAuthMode,
      defaultCredentials: true,
      password: {
        algorithm: "scrypt",
        hash: scryptPassword(defaultPassword, "spotifybu-default-password"),
        salt: "spotifybu-default-password"
      },
      updatedAt: new Date().toISOString(),
      username: defaultUsername,
      version: 1
    });

    return {
      authMode: nextAuthMode,
      defaultCredentials: true,
      username: defaultUsername
    };
  }

  await writeCredentials({
    ...credentialState.credentials,
    authMode: nextAuthMode,
    updatedAt: new Date().toISOString()
  });

  return {
    authMode: nextAuthMode,
    defaultCredentials: false,
    username: credentialState.username
  };
}

export async function readAppSession() {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(APP_AUTH_COOKIE)?.value;

  return verifyAppSessionCookie(cookieValue);
}

export function createAppSessionCookie(username: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + sessionDurationSeconds;
  const payload = Buffer.from(
    JSON.stringify({
      exp: expiresAt,
      u: username
    }),
    "utf8"
  ).toString("base64url");
  const signature = signPayload(payload);

  return `${payload}.${signature}`;
}

export function verifyAppSessionCookie(value?: string | null) {
  if (!value) {
    return null;
  }

  const [payload, signature] = value.split(".");

  if (!payload || !signature || !safeEqual(signPayload(payload), signature)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as {
      exp?: number;
      u?: string;
    };

    if (!parsed.u || !parsed.exp || parsed.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return {
      expiresAt: parsed.exp,
      username: parsed.u
    } satisfies AppAuthSession;
  } catch {
    return null;
  }
}

export function setAppSessionCookie(
  response: NextResponse,
  username: string,
  request?: CookieRequest
) {
  response.cookies.set(APP_AUTH_COOKIE, createAppSessionCookie(username), {
    ...cookieOptions(request),
    maxAge: sessionDurationSeconds
  });
}

export function clearAppSessionCookie(
  response: NextResponse,
  request?: CookieRequest
) {
  response.cookies.set(APP_AUTH_COOKIE, "", {
    ...cookieOptions(request),
    maxAge: 0
  });
}

async function readCredentialState(): Promise<CredentialState> {
  try {
    const contents = await readFile(getCredentialPath(), "utf8");
    const credentials = JSON.parse(contents) as StoredCredentials;

    if (
      credentials.version !== 1 ||
      credentials.password?.algorithm !== "scrypt" ||
      !credentials.username
    ) {
      throw new Error("Invalid app auth credential file.");
    }

    const authMode = credentials.authMode
      ? normalizeAppAuthMode(credentials.authMode)
      : getDefaultAppAuthMode();

    if (credentials.defaultCredentials) {
      return {
        authMode,
        defaultCredentials: true,
        username: credentials.username
      };
    }

    return {
      authMode,
      credentials,
      defaultCredentials: false,
      username: credentials.username
    };
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {
        authMode: getDefaultAppAuthMode(),
        defaultCredentials: true,
        username: defaultUsername
      };
    }

    throw error;
  }
}

function normalizeAppAuthMode(value?: string): AppAuthMode {
  return value === "external" ? "external" : "internal";
}

function getDefaultAppAuthMode(): AppAuthMode {
  return normalizeAppAuthMode(
    getTrackKeepEnvironmentValue("AUTH_MODE")?.trim()
  );
}

async function writeCredentials(credentials: StoredCredentials) {
  await mkdir(getConfigDirectory(), {
    recursive: true
  });
  await writeFile(
    getCredentialPath(),
    `${JSON.stringify(credentials, null, 2)}\n`,
    "utf8"
  );
}

function getCredentialPath() {
  return path.join(getConfigDirectory(), "app-auth.json");
}

function getConfigDirectory() {
  const configuredDirectory = getTrackKeepEnvironmentValue("CONFIG_DIR")?.trim();

  if (configuredDirectory) {
    return path.resolve(/* turbopackIgnore: true */ configuredDirectory);
  }

  return path.join(/* turbopackIgnore: true */ process.cwd(), ".spotifybu");
}

function getAppAuthSecret() {
  return (
    getTrackKeepEnvironmentValue("APP_SECRET") ||
    "spotifybu-development-session-secret"
  );
}

function signPayload(payload: string) {
  return createHmac("sha256", getAppAuthSecret())
    .update(payload)
    .digest("base64url");
}

function scryptPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
