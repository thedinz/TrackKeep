import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import {
  getNavidromeLibraryIndexScanStatus,
  startNavidromeLibraryIndexScan,
  type NavidromeLibraryIndexScanStatus
} from "./navidrome";

export type NavidromeAutoScanSettings = {
  enabled: boolean;
  time: string;
  timeZone: string;
};

export type NavidromeAutoScanSettingsUpdate =
  Partial<NavidromeAutoScanSettings>;

export type NavidromeAutoScanStatus = {
  lastScheduledAt?: string;
  nextRunAt?: string;
  scan: NavidromeLibraryIndexScanStatus;
  settings: NavidromeAutoScanSettings;
};

type StoredNavidromeAutoScanSettings = NavidromeAutoScanSettings & {
  updatedAt: string;
  version: 1;
};

const defaultNavidromeAutoScanSettings = {
  enabled: false,
  time: "03:00",
  timeZone: "UTC"
} satisfies NavidromeAutoScanSettings;
const maxTimeoutMs = 2_147_483_647;

let autoScanInitialized = false;
let autoScanTimer: ReturnType<typeof setTimeout> | null = null;
let lastScheduledAt: string | undefined;
let nextRunAt: string | undefined;

export async function getNavidromeAutoScanStatus() {
  const settings = await loadNavidromeAutoScanSettings();
  ensureNavidromeAutoScanScheduler(settings);

  return navidromeAutoScanStatus(settings);
}

export async function updateNavidromeAutoScanSettings(
  update: NavidromeAutoScanSettingsUpdate
) {
  const current = await loadNavidromeAutoScanSettings();
  const next = normalizeNavidromeAutoScanSettings(current, update);

  await saveNavidromeAutoScanSettings(next);
  scheduleNavidromeAutoScan(next);

  return navidromeAutoScanStatus(next);
}

export function ensureNavidromeAutoScanScheduler(
  settings?: NavidromeAutoScanSettings
) {
  if (settings) {
    scheduleNavidromeAutoScan(settings);
    autoScanInitialized = true;
    return;
  }

  if (autoScanInitialized) {
    return;
  }

  autoScanInitialized = true;
  void loadNavidromeAutoScanSettings()
    .then(scheduleNavidromeAutoScan)
    .catch((error) => {
      console.warn("[spotifybu.navidrome-auto-scan] scheduler init failed", {
        error: errorMessage(error)
      });
    });
}

export async function loadNavidromeAutoScanSettings() {
  try {
    const contents = await readFile(getNavidromeAutoScanSettingsPath(), "utf8");
    const parsed = JSON.parse(contents) as Partial<StoredNavidromeAutoScanSettings>;

    return normalizeNavidromeAutoScanSettings(
      defaultNavidromeAutoScanSettings,
      parsed
    );
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return defaultNavidromeAutoScanSettings;
    }

    throw error;
  }
}

export function normalizeNavidromeAutoScanSettings(
  fallback: NavidromeAutoScanSettings,
  partial: NavidromeAutoScanSettingsUpdate | Partial<StoredNavidromeAutoScanSettings>
) {
  return {
    enabled:
      typeof partial.enabled === "boolean" ? partial.enabled : fallback.enabled,
    time: normalizeAutoScanTime(partial.time, fallback.time),
    timeZone: normalizeAutoScanTimeZone(partial.timeZone, fallback.timeZone)
  } satisfies NavidromeAutoScanSettings;
}

export function nextNavidromeAutoScanRunAt(
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

function scheduleNavidromeAutoScan(settings: NavidromeAutoScanSettings) {
  if (autoScanTimer) {
    clearTimeout(autoScanTimer);
    autoScanTimer = null;
  }

  nextRunAt = undefined;

  if (!settings.enabled) {
    return;
  }

  const nextRun = nextNavidromeAutoScanRunAt(settings.time, settings.timeZone);
  const delayMs = Math.min(
    Math.max(0, nextRun.getTime() - Date.now()),
    maxTimeoutMs
  );

  nextRunAt = nextRun.toISOString();
  autoScanTimer = setTimeout(() => {
    void runScheduledNavidromeScan().catch((error) => {
      console.warn("[spotifybu.navidrome-auto-scan] scheduled scan failed", {
        error: errorMessage(error)
      });
    });
  }, delayMs);
}

async function runScheduledNavidromeScan() {
  const settings = await loadNavidromeAutoScanSettings();

  if (!settings.enabled) {
    scheduleNavidromeAutoScan(settings);
    return;
  }

  lastScheduledAt = new Date().toISOString();

  if (getNavidromeLibraryIndexScanStatus().state !== "running") {
    startNavidromeLibraryIndexScan();
  }

  scheduleNavidromeAutoScan(settings);
}

async function saveNavidromeAutoScanSettings(
  settings: NavidromeAutoScanSettings
) {
  await mkdir(getConfigDirectory(), {
    recursive: true
  });

  const payload = {
    ...settings,
    updatedAt: new Date().toISOString(),
    version: 1
  } satisfies StoredNavidromeAutoScanSettings;
  const settingsPath = getNavidromeAutoScanSettingsPath();
  const temporaryPath = `${settingsPath}.tmp`;

  await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(temporaryPath, settingsPath);
}

function navidromeAutoScanStatus(
  settings: NavidromeAutoScanSettings
): NavidromeAutoScanStatus {
  return {
    lastScheduledAt,
    nextRunAt,
    scan: getNavidromeLibraryIndexScanStatus(),
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

function getNavidromeAutoScanSettingsPath() {
  return path.join(getConfigDirectory(), "navidrome-auto-scan.json");
}

function getConfigDirectory() {
  const configuredDirectory = process.env.SPOTIFYBU_CONFIG_DIR?.trim();

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
