import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";

export type OrganizeNamingMode = "manual" | "lidarr" | "spotifybu";

export type OrganizeNamingSettings = {
  artistFolderFormat: string;
  colonReplacementFormat: number;
  lidarr: {
    apiKey: string;
    baseUrl: string;
  };
  mode: OrganizeNamingMode;
  multiDiscTrackFormat: string;
  replaceIllegalCharacters: boolean;
  standardTrackFormat: string;
};

export type OrganizeNamingSettingsView = Omit<
  OrganizeNamingSettings,
  "lidarr"
> & {
  lidarr: {
    apiKeySet: boolean;
    baseUrl: string;
  };
};

export type OrganizeNamingSettingsUpdate = Partial<
  Omit<OrganizeNamingSettings, "lidarr">
> & {
  lidarr?: {
    apiKey?: string;
    baseUrl?: string;
  };
};

export type LidarrNamingConfig = Pick<
  OrganizeNamingSettings,
  | "artistFolderFormat"
  | "colonReplacementFormat"
  | "multiDiscTrackFormat"
  | "replaceIllegalCharacters"
  | "standardTrackFormat"
>;

type StoredOrganizeNamingSettings = OrganizeNamingSettings & {
  updatedAt: string;
  version: 1;
};

type LidarrNamingResponse = Partial<LidarrNamingConfig> & {
  renameTracks?: boolean;
};

export const defaultOrganizeNamingSettings = {
  artistFolderFormat: "{Album Artist Name}",
  colonReplacementFormat: 4,
  lidarr: {
    apiKey: "",
    baseUrl: ""
  },
  mode: "spotifybu",
  multiDiscTrackFormat:
    "{Album Artist Name} - {Release Year} - {Album Title}/{medium:00}{track:00} - {Track Title}",
  replaceIllegalCharacters: true,
  standardTrackFormat:
    "{Album Artist Name} - {Release Year} - {Album Title}/{medium:00}{track:00} - {Track Title}"
} satisfies OrganizeNamingSettings;

export async function loadOrganizeNamingSettings() {
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
  const current = await loadOrganizeNamingSettings();
  const next = normalizeOrganizeNamingSettings(current, update);

  await saveOrganizeNamingSettings(next);

  return next;
}

export async function syncLidarrNamingSettings(override?: {
  apiKey?: string;
  baseUrl?: string;
}) {
  const current = await loadOrganizeNamingSettings();
  const naming = await fetchLidarrNamingConfig(current, override);
  const next = normalizeOrganizeNamingSettings(current, {
    ...naming,
    lidarr: {
      apiKey: override?.apiKey,
      baseUrl: override?.baseUrl
    },
    mode: "lidarr"
  });

  await saveOrganizeNamingSettings(next);

  return next;
}

export function toOrganizeNamingSettingsView(
  settings: OrganizeNamingSettings
): OrganizeNamingSettingsView {
  return {
    artistFolderFormat: settings.artistFolderFormat,
    colonReplacementFormat: settings.colonReplacementFormat,
    lidarr: {
      apiKeySet: settings.lidarr.apiKey.length > 0,
      baseUrl: settings.lidarr.baseUrl
    },
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

export async function fetchLidarrNamingConfig(
  settings: OrganizeNamingSettings,
  override?: {
    apiKey?: string;
    baseUrl?: string;
  }
) {
  const baseUrl = trimTrailingSlash(override?.baseUrl || settings.lidarr.baseUrl);
  const apiKey = override?.apiKey || settings.lidarr.apiKey;

  if (!baseUrl || !apiKey) {
    throw new Error("Lidarr URL and API key are required.");
  }

  const response = await fetch(new URL("api/v1/config/naming", `${baseUrl}/`), {
    headers: {
      "X-Api-Key": apiKey,
      accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from Lidarr.`);
  }

  const body = (await response.json()) as LidarrNamingResponse;

  if (
    !body.artistFolderFormat ||
    !body.standardTrackFormat ||
    !body.multiDiscTrackFormat
  ) {
    throw new Error("Lidarr did not return complete naming formats.");
  }

  return {
    artistFolderFormat: body.artistFolderFormat,
    colonReplacementFormat: normalizeColonReplacementFormat(
      body.colonReplacementFormat,
      defaultOrganizeNamingSettings.colonReplacementFormat
    ),
    multiDiscTrackFormat: body.multiDiscTrackFormat,
    replaceIllegalCharacters: body.replaceIllegalCharacters ?? true,
    standardTrackFormat: body.standardTrackFormat
  } satisfies LidarrNamingConfig;
}

export async function testLidarrNamingConnection(override?: {
  apiKey?: string;
  baseUrl?: string;
}) {
  try {
    const current = await loadOrganizeNamingSettings();
    const naming = await fetchLidarrNamingConfig(current, override);

    return {
      message: `Loaded Lidarr naming config: ${naming.artistFolderFormat}`,
      ok: true
    };
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : "Could not reach Lidarr.",
      ok: false
    };
  }
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
  const mode = normalizeNamingMode(partial.mode, fallback.mode);
  const merged = {
    ...fallback,
    ...compactStringValues(partial),
    colonReplacementFormat: normalizeColonReplacementFormat(
      partial.colonReplacementFormat,
      fallback.colonReplacementFormat
    ),
    lidarr: {
      ...fallback.lidarr,
      ...compactStringValues(partial.lidarr ?? {})
    },
    mode
  } satisfies OrganizeNamingSettings;

  if (mode === "spotifybu") {
    return {
      ...merged,
      artistFolderFormat: defaultOrganizeNamingSettings.artistFolderFormat,
      colonReplacementFormat:
        defaultOrganizeNamingSettings.colonReplacementFormat,
      multiDiscTrackFormat: defaultOrganizeNamingSettings.multiDiscTrackFormat,
      replaceIllegalCharacters:
        defaultOrganizeNamingSettings.replaceIllegalCharacters,
      standardTrackFormat: defaultOrganizeNamingSettings.standardTrackFormat
    } satisfies OrganizeNamingSettings;
  }

  return merged;
}

function normalizeNamingMode(
  value: unknown,
  fallback: OrganizeNamingMode
): OrganizeNamingMode {
  return value === "manual" || value === "lidarr" || value === "spotifybu"
    ? value
    : fallback;
}

function normalizeColonReplacementFormat(value: unknown, fallback: number) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 4
    ? parsed
    : fallback;
}

function compactStringValues<T extends Record<string, unknown>>(values: T) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => {
      if (typeof value !== "string") {
        return typeof value !== "undefined";
      }

      return value.trim().length > 0;
    })
  ) as Partial<T>;
}

function trimTrailingSlash(value: string) {
  return value.trim().replace(/\/+$/, "");
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
