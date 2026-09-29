export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  try {
    const { resumeInterruptedProviderBulkDownloadJobs } = await import(
      "@/lib/providers/download"
    );

    resumeInterruptedProviderBulkDownloadJobs();
  } catch (error) {
    console.warn("[trackkeep.startup] could not resume interrupted bulk jobs", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
