import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import { getTrackKeepEnvironmentValue } from "./trackkeep-env";
import {
  getMusicLibraryIndexScanStatus,
  startMusicLibraryIndexScan,
  type MusicLibraryIndexScanStatus
} from "./music-library";

export type MusicLibraryAutoScanSettings = {
  enabled: boolean;
  time: string;
  timeZone: string;
};

export type MusicLibraryAutoScanSettingsUpdate =
  Partial<MusicLibraryAutoScanSettings>;

export type MusicLibraryAutoScanStatus = {
  lastScheduledAt?: string;
  nextRunAt?: string;
  scan: MusicLibraryIndexScanStatus;
  settings: MusicLibraryAutoScanSettings;
};

type StoredMusicLibraryAutoScanSettings = MusicLibraryAutoScanSettings & {
  updatedAt: string;
  version: 1;
};

const defaultMusicLibraryAutoScanSettings = {
  enabled: false,
  time: "03:00",
  timeZone: "UTC"
} satisfies MusicLibraryAutoScanSettings;
const maxTimeoutMs = 2_147_483_647;

let autoScanInitialized = false;
let autoScanTimer: ReturnType<typeof setTimeout> | null = null;
let lastScheduledAt: string | undefined;
let nextRunAt: string | undefined;

export async function getMusicLibraryAutoScanStatus() {
  const settings = await loadMusicLibraryAutoScanSettings();
  ensureMusicLibraryAutoScanScheduler(settings);

  return musicLibraryAutoScanStatus(settings);
}

export async function updateMusicLibraryAutoScanSettings(
  update: MusicLibraryAutoScanSettingsUpdate
) {
  const current = await loadMusicLibraryAutoScanSettings();
  const next = normalizeMusicLibraryAutoScanSettings(current, update);

  await saveMusicLibraryAutoScanSettings(next);
  scheduleMusicLibraryAutoScan(next);

  return musicLibraryAutoScanStatus(next);
}

export function ensureMusicLibraryAutoScanScheduler(
  settings?: MusicLibraryAutoScanSettings
) {
  if (settings) {
    scheduleMusicLibraryAutoScan(settings);
    autoScanInitialized = true;
    return;
  }

  if (autoScanInitialized) {
    return;
  }

  autoScanInitialized = true;
  void loadMusicLibraryAutoScanSettings()
    .then(scheduleMusicLibraryAutoScan)
    .catch((error) => {
      console.warn("[spotifybu.music-library-auto-scan] scheduler init failed", {
        error: errorMessage(error)
      });
    });
}

export async function loadMusicLibraryAutoScanSettings() {
  try {
    const contents = await readFile(getMusicLibraryAutoScanSettingsPath(), "utf8");
    const parsed = JSON.parse(contents) as Partial<StoredMusicLibraryAutoScanSettings>;

    return normalizeMusicLibraryAutoScanSettings(
      defaultMusicLibraryAutoScanSettings,
      parsed
    );
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return defaultMusicLibraryAutoScanSettings;
    }

    throw error;
  }
}

export function normalizeMusicLibraryAutoScanSettings(
  fallback: MusicLibraryAutoScanSettings,
  partial: MusicLibraryAutoScanSettingsUpdate | Partial<StoredMusicLibraryAutoScanSettings>
) {
  return {
    enabled:
      typeof partial.enabled === "boolean" ? partial.enabled : fallback.enabled,
    time: normalizeAutoScanTime(partial.time, fallback.time),
    timeZone: normalizeAutoScanTimeZone(partial.timeZone, fallback.timeZone)
  } satisfies MusicLibraryAutoScanSettings;
}

export function nextMusicLibraryAutoScanRunAt(
  time: string,
  timeZone: string,
  now = new Date()
) {
  const [hour, minute] = time.split(":").map(Number);
  const localNow = zonedDateTimeParts(now, timeZone);
  const todayRun = zonedDateTimeToDate(
    {
      day: localNow.day,
      hour,
      minute,
      month: localNow.month,
      year: localNow.year
    },
    timeZone
  );

  if (todayRun.getTime() > now.getTime()) {
    return todayRun;
  }

  return zonedDateTimeToDate(
    {
      ...addLocalDays(localNow, 1),
      hour,
      minute
    },
    timeZone
  );
}

function scheduleMusicLibraryAutoScan(settings: MusicLibraryAutoScanSettings) {
  if (autoScanTimer) {
    clearTimeout(autoScanTimer);
    autoScanTimer = null;
  }

  nextRunAt = undefined;

  if (!settings.enabled) {
    return;
  }

  const nextRun = nextMusicLibraryAutoScanRunAt(settings.time, settings.timeZone);
  const delayMs = Math.min(
    Math.max(0, nextRun.getTime() - Date.now()),
    maxTimeoutMs
  );

  nextRunAt = nextRun.toISOString();
  autoScanTimer = setTimeout(() => {
    void runScheduledMusicLibraryScan().catch((error) => {
      console.warn("[spotifybu.music-library-auto-scan] scheduled scan failed", {
        error: errorMessage(error)
      });
    });
  }, delayMs);
}

async function runScheduledMusicLibraryScan() {
  const settings = await loadMusicLibraryAutoScanSettings();

  if (!settings.enabled) {
    scheduleMusicLibraryAutoScan(settings);
    return;
  }

  lastScheduledAt = new Date().toISOString();

  if (getMusicLibraryIndexScanStatus().state !== "running") {
    startMusicLibraryIndexScan();
  }

  scheduleMusicLibraryAutoScan(settings);
}

async function saveMusicLibraryAutoScanSettings(
  settings: MusicLibraryAutoScanSettings
) {
  await mkdir(getConfigDirectory(), {
    recursive: true
  });

  const payload = {
    ...settings,
    updatedAt: new Date().toISOString(),
    version: 1
  } satisfies StoredMusicLibraryAutoScanSettings;
  const settingsPath = getMusicLibraryAutoScanSettingsPath();
  const temporaryPath = `${settingsPath}.tmp`;

  await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(temporaryPath, settingsPath);
}

function musicLibraryAutoScanStatus(
  settings: MusicLibraryAutoScanSettings
): MusicLibraryAutoScanStatus {
  return {
    lastScheduledAt,
    nextRunAt,
    scan: getMusicLibraryIndexScanStatus(),
    settings
  };
}

function normalizeAutoScanTime(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return fallback;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return fallback;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeAutoScanTimeZone(value: unknown, fallback: string) {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  const timeZone = value.trim();

  try {
    new Intl.DateTimeFormat("en-US", {
      timeZone
    });
    return timeZone;
  } catch {
    return fallback;
  }
}

function zonedDateTimeParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric"
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );

  return {
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    month: values.month,
    year: values.year
  };
}

function zonedDateTimeToDate(
  target: {
    day: number;
    hour: number;
    minute: number;
    month: number;
    year: number;
  },
  timeZone: string
) {
  let utc = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute
  );
  const targetAsUtc = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute
  );

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = zonedDateTimeParts(new Date(utc), timeZone);
    const partsAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute
    );
    const delta = targetAsUtc - partsAsUtc;

    if (delta === 0) {
      break;
    }

    utc += delta;
  }

  return new Date(utc);
}

function addLocalDays(
  parts: {
    day: number;
    month: number;
    year: number;
  },
  days: number
) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));

  return {
    day: date.getUTCDate(),
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear()
  };
}

function getMusicLibraryAutoScanSettingsPath() {
  return path.join(getConfigDirectory(), "music-library-auto-scan.json");
}

function getConfigDirectory() {
  const configuredDirectory = getTrackKeepEnvironmentValue("CONFIG_DIR")?.trim();

  if (configuredDirectory) {
    return path.resolve(/* turbopackIgnore: true */ configuredDirectory);
  }

  return path.join(/* turbopackIgnore: true */ process.cwd(), ".spotifybu");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown error";
}
