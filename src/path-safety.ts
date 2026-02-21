import fs from "fs";
import path from "path";

const REPO_ROOT = process.cwd();

export function resolveAndValidate(filePath: string, repoRoot = REPO_ROOT): { relative: string; valid: boolean } {
  const resolved = path.resolve(repoRoot, filePath);
  let realResolved: string;
  try {
    const parentDir = path.dirname(resolved);
    if (fs.existsSync(parentDir)) {
      realResolved = path.join(fs.realpathSync(parentDir), path.basename(resolved));
    } else {
      realResolved = resolved;
    }
  } catch {
    realResolved = resolved;
  }

  const relative = path.relative(repoRoot, realResolved);
  const valid = !relative.startsWith("..") && !path.isAbsolute(relative);
  return { relative, valid };
}

export function matchesPathList(relative: string, pathList: string[]): boolean {
  return pathList.some(p => {
    const cleaned = p.replace(/\/?\*\*$/, "").replace(/\*$/, "");
    if (!cleaned) return true;
    return relative === cleaned || relative.startsWith(cleaned.endsWith("/") ? cleaned : cleaned + "/");
  });
}

export function isPathSafe(
  filePath: string,
  safePaths: string[],
  neverTouch: string[],
  repoRoot = REPO_ROOT
): boolean {
  const { relative, valid } = resolveAndValidate(filePath, repoRoot);
  if (!valid) return false;
  if (matchesPathList(relative, neverTouch)) return false;
  if (matchesPathList(relative, safePaths)) return true;
  return false;
}
