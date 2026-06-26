import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";

export type OrganizeNamingMode = "standard";

export type OrganizeNamingSettings = {
  artistFolderFormat: string;
  colonReplacementFormat: number;
  mode: OrganizeNamingMode;
  multiDiscTrackFormat: string;
  replaceIllegalCharacters: boolean;
  standardTrackFormat: string;
};

export type OrganizeNamingSettingsView = OrganizeNamingSettings;

export type OrganizeNamingSettingsUpdate = Partial<OrganizeNamingSettings>;

type StoredOrganizeNamingSettings = OrganizeNamingSettings & {
  updatedAt: string;
  version: 1;
};

export const defaultOrganizeNamingSettings = {
  artistFolderFormat: "{Album Artist Name}",
  colonReplacementFormat: 4,
  mode: "standard",
  multiDiscTrackFormat:
    "{Album Artist Name} - {Album Title} ({Release Year})/{Album Artist Name} - {Album Title} ({Release Year}) - {medium:00}-{track:00} - {Track Title}",
  replaceIllegalCharacters: true,
  standardTrackFormat:
    "{Album Artist Name} - {Album Title} ({Release Year})/{Album Artist Name} - {Album Title} ({Release Year}) - {track:00} - {Track Title}"
} satisfies OrganizeNamingSettings;

export async function loadOrganizeNamingSettings() {
  return loadStoredOrganizeNamingSettings();
}

async function loadStoredOrganizeNamingSettings() {
  try {
    const contents = await readFile(getOrganizeSettingsPath(), "utf8");
    const parsed = JSON.parse(contents) as Partial<StoredOrganizeNamingSettings>;

    return normalizeOrganizeNamingSettings(
      defaultOrganizeNamingSettings,
      parsed
    );
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return defaultOrganizeNamingSettings;
    }

    throw error;
  }
}

export async function updateOrganizeNamingSettings(
  update: OrganizeNamingSettingsUpdate
) {
  const next = normalizeOrganizeNamingSettings(
    defaultOrganizeNamingSettings,
    update
  );

  await saveOrganizeNamingSettings(next);

  return next;
}

export function toOrganizeNamingSettingsView(
  settings: OrganizeNamingSettings
): OrganizeNamingSettingsView {
  return {
    artistFolderFormat: settings.artistFolderFormat,
    colonReplacementFormat: settings.colonReplacementFormat,
    mode: settings.mode,
    multiDiscTrackFormat: settings.multiDiscTrackFormat,
    replaceIllegalCharacters: settings.replaceIllegalCharacters,
    standardTrackFormat: settings.standardTrackFormat
  };
}

export function organizeNamingSettingsKey(settings: OrganizeNamingSettings) {
  return JSON.stringify({
    artistFolderFormat: settings.artistFolderFormat,
    colonReplacementFormat: settings.colonReplacementFormat,
    mode: settings.mode,
    multiDiscTrackFormat: settings.multiDiscTrackFormat,
    replaceIllegalCharacters: settings.replaceIllegalCharacters,
    standardTrackFormat: settings.standardTrackFormat
  });
}

async function saveOrganizeNamingSettings(settings: OrganizeNamingSettings) {
  await mkdir(getConfigDirectory(), {
    recursive: true
  });

  const payload = {
    ...settings,
    updatedAt: new Date().toISOString(),
    version: 1
  } satisfies StoredOrganizeNamingSettings;
  const settingsPath = getOrganizeSettingsPath();
  const temporaryPath = `${settingsPath}.tmp`;

  await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(temporaryPath, settingsPath);
}

function normalizeOrganizeNamingSettings(
  fallback: OrganizeNamingSettings,
  partial: OrganizeNamingSettingsUpdate | Partial<StoredOrganizeNamingSettings>
) {
  return {
    ...fallback,
    artistFolderFormat: defaultOrganizeNamingSettings.artistFolderFormat,
    colonReplacementFormat:
      defaultOrganizeNamingSettings.colonReplacementFormat,
    mode: "standard",
    multiDiscTrackFormat: defaultOrganizeNamingSettings.multiDiscTrackFormat,
    replaceIllegalCharacters:
      defaultOrganizeNamingSettings.replaceIllegalCharacters,
    standardTrackFormat: defaultOrganizeNamingSettings.standardTrackFormat
  } satisfies OrganizeNamingSettings;
}

function getOrganizeSettingsPath() {
  return path.join(getConfigDirectory(), "organize-settings.json");
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
