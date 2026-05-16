import fs from "fs";
import path from "path";
import { exec } from "child_process";

const SNEEBLY_DIR = path.join(process.cwd(), ".sneebly");
const ACCEPTANCE_TESTS_DIR = path.join(SNEEBLY_DIR, "acceptance-tests");
const ACCEPTANCE_RESULTS_DIR = path.join(SNEEBLY_DIR, "acceptance-results");

const SCRIPT_TIMEOUT_MS = 30000;

export interface ValidationResult {
  passed: boolean;
  output: string;
  durationMs: number;
  exitCode: number;
  skipped?: boolean;
  skipReason?: string;
}

function ensureResultsDir(): void {
  if (!fs.existsSync(ACCEPTANCE_RESULTS_DIR)) {
    fs.mkdirSync(ACCEPTANCE_RESULTS_DIR, { recursive: true });
  }
}

export async function runAcceptanceTest(featureId: string): Promise<ValidationResult> {
  const testPath = path.join(ACCEPTANCE_TESTS_DIR, `${featureId}.sh`);

  if (!fs.existsSync(testPath)) {
    const result: ValidationResult = {
      passed: false,
      output: "No acceptance test script found — feature cannot be marked done without empirical validation",
      durationMs: 0,
      exitCode: -1,
      skipped: true,
      skipReason: "no-test-script",
    };
    storeResult(featureId, result);
    console.log(`[FeatureValidator] No acceptance test found for ${featureId} — cannot validate`);
    return result;
  }

  try {
    fs.chmodSync(testPath, 0o755);
  } catch {}

  const start = Date.now();

  return new Promise<ValidationResult>((resolve) => {
    exec(
      `bash "${testPath}"`,
      {
        cwd: process.cwd(),
        timeout: SCRIPT_TIMEOUT_MS,
        maxBuffer: 1024 * 512,
        env: { ...process.env, PATH: process.env.PATH },
      },
      (error, stdout, stderr) => {
        const durationMs = Date.now() - start;
        const output = [stdout, stderr].filter(Boolean).join("\n").trim();
        const exitCode = error?.code !== undefined ? (error.code as number) : 0;

        const exitedClean = !error || exitCode === 0;
        const outputContainsFail = /^FAIL:/m.test(output);
        const passed = exitedClean && !outputContainsFail;
        const effectiveExitCode = passed ? 0 : (outputContainsFail && exitCode === 0 ? 1 : (exitCode || 1));

        const result: ValidationResult = {
          passed,
          output: output.slice(0, 4000),
          durationMs,
          exitCode: effectiveExitCode,
        };

        storeResult(featureId, result);

        if (passed) {
          console.log(`[FeatureValidator] PASS: ${featureId} (${durationMs}ms)`);
        } else {
          console.log(`[FeatureValidator] FAIL: ${featureId} (exit ${exitCode}) — ${output.slice(0, 200)}`);
        }

        resolve(result);
      }
    );
  });
}

function storeResult(featureId: string, result: ValidationResult): void {
  try {
    ensureResultsDir();
    const resultPath = path.join(ACCEPTANCE_RESULTS_DIR, `${featureId}.json`);
    fs.writeFileSync(
      resultPath,
      JSON.stringify(
        {
          passed: result.passed,
          output: result.output,
          exitCode: result.exitCode,
          durationMs: result.durationMs,
          skipped: result.skipped,
          testedAt: new Date().toISOString(),
        },
        null,
        2
      ),
      "utf-8"
    );
  } catch (e) {
    console.log(`[FeatureValidator] Could not store result for ${featureId}: ${(e as Error).message}`);
  }
}

export function getStoredResult(featureId: string): (ValidationResult & { testedAt?: string }) | null {
  try {
    const resultPath = path.join(ACCEPTANCE_RESULTS_DIR, `${featureId}.json`);
    if (!fs.existsSync(resultPath)) return null;
    return JSON.parse(fs.readFileSync(resultPath, "utf-8"));
  } catch {
    return null;
  }
}

export function getAllStoredResults(): Record<string, ValidationResult & { testedAt?: string }> {
  const results: Record<string, ValidationResult & { testedAt?: string }> = {};
  try {
    if (!fs.existsSync(ACCEPTANCE_RESULTS_DIR)) return results;
    const files = fs.readdirSync(ACCEPTANCE_RESULTS_DIR).filter(f => f.endsWith(".json"));
    for (const file of files) {
      const featureId = file.replace(".json", "");
      const content = fs.readFileSync(path.join(ACCEPTANCE_RESULTS_DIR, file), "utf-8");
      results[featureId] = JSON.parse(content);
    }
  } catch {}
  return results;
}

export function formatTestFailureContext(featureId: string, result: ValidationResult): string {
  const testPath = path.join(ACCEPTANCE_TESTS_DIR, `${featureId}.sh`);
  let scriptSection = "";
  try {
    if (fs.existsSync(testPath)) {
      const script = fs.readFileSync(testPath, "utf-8");
      scriptSection = `\n\nACCEPTANCE TEST SCRIPT (the EXACT checks that must pass):\n\`\`\`bash\n${script.slice(0, 2000)}\n\`\`\`\nSTUDY the script above. Understand EXACTLY which files and strings are being checked. Your implementation must satisfy every check in this script.`;
    }
  } catch {}

  return `[ACCEPTANCE TEST FAILED] Feature: ${featureId}
Exit code: ${result.exitCode}
Duration: ${result.durationMs}ms
Test output:
${result.output.slice(0, 1500)}${scriptSection}`;
}
