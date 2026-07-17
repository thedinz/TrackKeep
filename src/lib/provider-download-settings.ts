import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import { getTrackKeepEnvironmentValue } from "./trackkeep-env";

export type ProviderDownloadOpusQuality = "160" | "192" | "256";
export type ProviderDownloadFallbackFormat = "mp3" | "none";
export type ProviderDownloadMp3FallbackQuality = "192" | "256" | "320";

export type ProviderDownloadSettings = {
  fallbackFormat: ProviderDownloadFallbackFormat;
  mp3FallbackQuality: ProviderDownloadMp3FallbackQuality;
  opusQuality: ProviderDownloadOpusQuality;
};

export type ProviderDownloadSettingsUpdate = Partial<ProviderDownloadSettings>;

type StoredProviderDownloadSettings = ProviderDownloadSettings & {
  updatedAt: string;
  version: 1;
};

export const defaultProviderDownloadSettings = {
  fallbackFormat: "mp3",
  mp3FallbackQuality: "320",
  opusQuality: "192"
} satisfies ProviderDownloadSettings;

export async function loadProviderDownloadSettings() {
  try {
    const contents = await readFile(getProviderDownloadSettingsPath(), "utf8");
    const parsed = JSON.parse(contents) as Partial<StoredProviderDownloadSettings>;

    return normalizeProviderDownloadSettings(
      defaultProviderDownloadSettings,
      parsed
    );
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return defaultProviderDownloadSettings;
    }

    throw error;
  }
}

export async function updateProviderDownloadSettings(
  update: ProviderDownloadSettingsUpdate
) {
  const current = await loadProviderDownloadSettings();
  const next = normalizeProviderDownloadSettings(current, update);

  await saveProviderDownloadSettings(next);

  return next;
}

export function normalizeProviderDownloadSettings(
  fallback: ProviderDownloadSettings,
  partial: ProviderDownloadSettingsUpdate | Partial<StoredProviderDownloadSettings>
) {
  return {
    fallbackFormat: normalizeFallbackFormat(
      partial.fallbackFormat,
      fallback.fallbackFormat
    ),
    mp3FallbackQuality: normalizeMp3FallbackQuality(
      partial.mp3FallbackQuality,
      fallback.mp3FallbackQuality
    ),
    opusQuality: normalizeOpusQuality(partial.opusQuality, fallback.opusQuality)
  } satisfies ProviderDownloadSettings;
}

function normalizeFallbackFormat(
  value: unknown,
  fallback: ProviderDownloadFallbackFormat
) {
  return value === "mp3" || value === "none" ? value : fallback;
}

function normalizeMp3FallbackQuality(
  value: unknown,
  fallback: ProviderDownloadMp3FallbackQuality
) {
  return value === "192" || value === "256" || value === "320"
    ? value
    : fallback;
}

function normalizeOpusQuality(
  value: unknown,
  fallback: ProviderDownloadOpusQuality
) {
  return value === "160" || value === "192" || value === "256"
    ? value
    : fallback;
}

async function saveProviderDownloadSettings(settings: ProviderDownloadSettings) {
  await mkdir(getConfigDirectory(), {
    recursive: true
  });

  const payload = {
    ...settings,
    updatedAt: new Date().toISOString(),
    version: 1
  } satisfies StoredProviderDownloadSettings;
  const settingsPath = getProviderDownloadSettingsPath();
  const temporaryPath = `${settingsPath}.tmp`;

  await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(temporaryPath, settingsPath);
}

function getProviderDownloadSettingsPath() {
  return path.join(getConfigDirectory(), "provider-download-settings.json");
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
