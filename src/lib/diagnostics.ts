import { appendFile, mkdir } from "fs/promises";
import path from "path";

type DiagnosticDetails = Record<string, unknown>;

export async function appendDiagnosticLog(
  event: string,
  details: DiagnosticDetails = {}
) {
  const logPath = getDiagnosticLogPath();

  try {
    await mkdir(path.dirname(logPath), {
      recursive: true
    });
    await appendFile(
      logPath,
      `${JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        ...details
      })}\n`,
      "utf8"
    );
  } catch (error) {
    console.error("[spotifybu.diagnostics] log write failed", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export function diagnosticError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack?.split("\n").slice(0, 8).join("\n")
    };
  }

  return {
    message: String(error),
    name: typeof error
  };
}

function getDiagnosticLogPath() {
  return path.join(getConfigDirectory(), "logs", "spotifybu.log");
}

function getConfigDirectory() {
  const configuredDirectory = process.env.SPOTIFYBU_CONFIG_DIR?.trim();

  if (configuredDirectory) {
    return path.resolve(/* turbopackIgnore: true */ configuredDirectory);
  }

  return path.join(/* turbopackIgnore: true */ process.cwd(), ".spotifybu");
}
