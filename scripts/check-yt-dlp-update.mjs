import { spawnSync } from "node:child_process";
import https from "node:https";

const pypiUrl = "https://pypi.org/pypi/yt-dlp/json";

const metadata = await fetchJson(pypiUrl);
const stableVersion = String(metadata.info?.version ?? "unknown");
const latestRelease = latestUploadedRelease(metadata.releases ?? {});
const installedVersion = installedYtDlpVersion();

console.log(`yt-dlp stable: ${stableVersion}`);
console.log(
  `yt-dlp latest available: ${latestRelease?.version ?? "unknown"}${
    latestRelease?.uploadedAt ? ` (${formatUploadedAt(latestRelease.uploadedAt)})` : ""
  }`
);
console.log(`yt-dlp installed: ${installedVersion ?? "not found on PATH"}`);

if (
  process.env.SPOTIFYBU_YTDLP_CHECK_FAIL_ON_STALE === "1" &&
  installedVersion &&
  latestRelease?.version &&
  installedVersion !== latestRelease.version
) {
  console.error(
    `Installed yt-dlp ${installedVersion} is not the latest available ${latestRelease.version}.`
  );
  process.exit(1);
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "TrackKeep yt-dlp update check"
        },
        timeout: 15000
      },
      (response) => {
        const chunks = [];

        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          if (!response.statusCode || response.statusCode >= 400) {
            reject(
              new Error(`PyPI returned HTTP ${response.statusCode ?? "unknown"}.`)
            );
            return;
          }

          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error("Timed out while checking PyPI for yt-dlp."));
    });
    request.on("error", reject);
  });
}

function latestUploadedRelease(releases) {
  return Object.entries(releases)
    .map(([version, files]) => {
      const uploadedAt = Array.isArray(files)
        ? files
            .filter((file) => !file.yanked)
            .map((file) => Date.parse(String(file.upload_time_iso_8601 ?? "")))
            .filter(Number.isFinite)
            .sort((left, right) => right - left)[0]
        : undefined;

      return {
        uploadedAt,
        version
      };
    })
    .filter((release) => Number.isFinite(release.uploadedAt))
    .sort((left, right) => Number(right.uploadedAt) - Number(left.uploadedAt))[0];
}

function formatUploadedAt(value) {
  return new Date(value).toISOString();
}

function installedYtDlpVersion() {
  const result = spawnSync("yt-dlp", ["--version"], {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    return null;
  }

  return result.stdout.trim() || null;
}
