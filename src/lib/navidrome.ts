import { constants } from "fs";
import { access, mkdir, stat } from "fs/promises";
import path from "path";

export type NavidromeLibraryState =
  | "not_configured"
  | "missing"
  | "not_directory"
  | "not_readable"
  | "not_writable"
  | "ready"
  | "error";

export type NavidromeLibraryStatus = {
  configured: boolean;
  exists: boolean;
  libraryPath?: string;
  message: string;
  navidromeUrl?: string;
  readable: boolean;
  state: NavidromeLibraryState;
  writable: boolean;
};

export function getNavidromeLibraryPath() {
  const configuredPath = process.env.NAVIDROME_LIBRARY_PATH?.trim();

  return configuredPath ? path.resolve(configuredPath) : null;
}

export function getNavidromeUrl() {
  return process.env.NAVIDROME_URL?.trim() || "http://localhost:4533";
}

export async function getNavidromeLibraryStatus() {
  const libraryPath = getNavidromeLibraryPath();
  const navidromeUrl = getNavidromeUrl();

  if (!libraryPath) {
    return {
      configured: false,
      exists: false,
      message: "Set NAVIDROME_LIBRARY_PATH to the music folder Navidrome scans.",
      navidromeUrl,
      readable: false,
      state: "not_configured",
      writable: false
    } satisfies NavidromeLibraryStatus;
  }

  try {
    const libraryStats = await stat(libraryPath);

    if (!libraryStats.isDirectory()) {
      return {
        configured: true,
        exists: true,
        libraryPath,
        message: "NAVIDROME_LIBRARY_PATH exists but is not a directory.",
        navidromeUrl,
        readable: false,
        state: "not_directory",
        writable: false
      } satisfies NavidromeLibraryStatus;
    }

    const readable = await canAccess(libraryPath, constants.R_OK);
    const writable = await canAccess(libraryPath, constants.W_OK);

    if (!readable) {
      return {
        configured: true,
        exists: true,
        libraryPath,
        message: "SpotifyBU cannot read the configured Navidrome library path.",
        navidromeUrl,
        readable,
        state: "not_readable",
        writable
      } satisfies NavidromeLibraryStatus;
    }

    if (!writable) {
      return {
        configured: true,
        exists: true,
        libraryPath,
        message: "SpotifyBU cannot write into the Navidrome library path.",
        navidromeUrl,
        readable,
        state: "not_writable",
        writable
      } satisfies NavidromeLibraryStatus;
    }

    return {
      configured: true,
      exists: true,
      libraryPath,
      message: "Ready to stage authorized audio files for Navidrome scanning.",
      navidromeUrl,
      readable,
      state: "ready",
      writable
    } satisfies NavidromeLibraryStatus;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {
        configured: true,
        exists: false,
        libraryPath,
        message: "NAVIDROME_LIBRARY_PATH does not exist on this server.",
        navidromeUrl,
        readable: false,
        state: "missing",
        writable: false
      } satisfies NavidromeLibraryStatus;
    }

    return {
      configured: true,
      exists: false,
      libraryPath,
      message: "SpotifyBU could not inspect the Navidrome library path.",
      navidromeUrl,
      readable: false,
      state: "error",
      writable: false
    } satisfies NavidromeLibraryStatus;
  }
}

export async function ensureNavidromeTargetDirectory(segments: string[]) {
  const libraryPath = getNavidromeLibraryPath();

  if (!libraryPath) {
    throw new Error("NAVIDROME_LIBRARY_PATH is not configured.");
  }

  const targetPath = path.resolve(
    libraryPath,
    ...segments.map(sanitizePathSegment)
  );
  const relativePath = path.relative(libraryPath, targetPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Resolved Navidrome target escaped the library path.");
  }

  await mkdir(targetPath, {
    recursive: true
  });

  return targetPath;
}

function sanitizePathSegment(segment: string) {
  return (
    segment
      .normalize("NFKD")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "Unknown"
  );
}

async function canAccess(filePath: string, mode: number) {
  try {
    await access(filePath, mode);
    return true;
  } catch {
    return false;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
