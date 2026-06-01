import { execFileSync } from "child_process";
import packageJson from "../../package.json";

export type AppInfo = {
  branch: string;
  version: string;
};

export function getAppInfo() {
  return {
    branch: getBranchName(),
    version: packageJson.version
  } satisfies AppInfo;
}

function getBranchName() {
  const branchFromEnv =
    process.env.NEXT_PUBLIC_GIT_BRANCH ||
    process.env.GIT_BRANCH ||
    process.env.VERCEL_GIT_COMMIT_REF ||
    process.env.GITHUB_REF_NAME ||
    process.env.BRANCH_NAME;

  if (branchFromEnv) {
    return stripGitRef(branchFromEnv);
  }

  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8"
    }).trim();
  } catch {
    return "unknown";
  }
}

function stripGitRef(branch: string) {
  return branch.replace(/^refs\/heads\//, "");
}
