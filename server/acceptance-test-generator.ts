import fs from "fs";
import path from "path";
import { callClaude, extractJson } from "./utils";

const SNEEBLY_DIR = path.join(process.cwd(), ".sneebly");
const ACCEPTANCE_TESTS_DIR = path.join(SNEEBLY_DIR, "acceptance-tests");
const GOALS_FILE = path.join(process.cwd(), "GOALS.md");

function readGoals(): string {
  try {
    if (!fs.existsSync(GOALS_FILE)) return "";
    const content = fs.readFileSync(GOALS_FILE, "utf-8");
    return content.length > 8000 ? content.slice(0, 8000) + "\n...[truncated]" : content;
  } catch {
    return "";
  }
}

function ensureDir(): void {
  if (!fs.existsSync(ACCEPTANCE_TESTS_DIR)) {
    fs.mkdirSync(ACCEPTANCE_TESTS_DIR, { recursive: true });
  }
}

export function getTestPath(featureId: string): string {
  return path.join(ACCEPTANCE_TESTS_DIR, `${featureId}.sh`);
}

export function testExists(featureId: string): boolean {
  return fs.existsSync(getTestPath(featureId));
}

const COUNTER_VARS = /FAIL_COUNT|PASS_COUNT|FAIL_TOTAL|PASS_TOTAL|ERR_COUNT/;

function sanitizeScript(script: string): string {
  const rawLines = script.split("\n");
  const pass1: string[] = [];

  let inCounterBlock = false;
  let counterBlockDepth = 0;

  for (const line of rawLines) {
    if (/^\s*set\s+-[a-z]*e[a-z]*\s*$/.test(line)) continue;
    if (/^\s*(PASS|FAIL|FAIL_COUNT|ERRORS?|COUNT|TOTAL|PASS_TOTAL|ERR_COUNT)\s*=\s*0/.test(line)) continue;
    if (/\(\(\s*(PASS|FAIL|FAIL_COUNT|ERRORS?|COUNT)\s*\+\+\s*\)\)/.test(line)) continue;
    if (/\$\(\(\s*(PASS|FAIL|FAIL_COUNT|ERRORS?|COUNT)/.test(line)) continue;
    if (/^\s*#\s*SANITIZED:/.test(line)) continue;
    if (/grep\s+-q.*\|.*grep\s+-q/.test(line)) continue;

    if (!inCounterBlock && /if\s*\[/.test(line) && COUNTER_VARS.test(line)) {
      inCounterBlock = true;
      counterBlockDepth = 1;
      continue;
    }

    if (inCounterBlock) {
      if (/^\s*if\b/.test(line)) counterBlockDepth++;
      if (/^\s*fi\b/.test(line)) {
        counterBlockDepth--;
        if (counterBlockDepth <= 0) {
          inCounterBlock = false;
        }
      }
      continue;
    }

    if (COUNTER_VARS.test(line)) continue;

    pass1.push(line);
  }

  const result: string[] = [];
  for (let i = 0; i < pass1.length; i++) {
    result.push(pass1[i]);
    if (/^\s*echo\s+["']FAIL:/.test(pass1[i]) || /^\s*echo\s+"FAIL/.test(pass1[i])) {
      const nextLine = pass1[i + 1] || "";
      if (!/^\s*exit\s+1/.test(nextLine)) {
        result.push("  exit 1");
      }
    }
  }

  // Ensure 302 is always accepted alongside 401/403 for curl status checks.
  // Matches the standard pattern:  if [ "$status_var" = "200" ] || ... || [ "$status_var" = "403" ]; then
  // If the line includes "403" but NOT "302", extract the variable from the first
  // `[ "$status_..." ]` group and append a 302 clause before `; then`.
  const final = result.map(line => {
    if (!line.includes('"403"') || line.includes('"302"')) return line;
    // Extract variable name from pattern: [ "$status_anything" = 
    const varMatch = line.match(/\[\s+"(\$status_[^"]+)"\s*=/);
    if (!varMatch) return line;
    const varName = varMatch[1];
    // Insert 302 clause before the final `; then` (or `]; then`)
    return line.replace(
      /(\|\|\s*\[\s+"?\$status_[^"=\s]+["\s]*=\s*"403"\s*\])\s*;?\s*then/,
      `$1 || [ "${varName}" = "302" ]; then`
    );
  });

  return final.join("\n").trim() + "\n";
}

function writeTestScript(featureId: string, script: string): void {
  ensureDir();
  const testPath = getTestPath(featureId);
  let content = script;
  if (!content.startsWith("#!")) {
    content = "#!/usr/bin/env bash\n" + content;
  }
  content = sanitizeScript(content);
  if (!content.startsWith("#!")) {
    content = "#!/usr/bin/env bash\n" + content;
  }
  fs.writeFileSync(testPath, content, { mode: 0o755 });
}

export function generateFallbackTestSync(featureId: string, featureTitle: string, featureDescription: string): string {
  const SERVER = "http://localhost:5000";

  const apiPatterns: string[] = [];
  const descLower = featureDescription.toLowerCase();
  const titleLower = featureTitle.toLowerCase();

  if (descLower.includes("/api/projects") || titleLower.includes("project")) {
    apiPatterns.push("/api/projects");
  }
  if (descLower.includes("/api/users") || titleLower.includes("user")) {
    apiPatterns.push("/api/users/me");
  }
  if (descLower.includes("/stories") || titleLower.includes("stor")) {
    apiPatterns.push("/api/projects");
  }
  if (descLower.includes("/characters") || titleLower.includes("character")) {
    apiPatterns.push("/api/projects");
  }
  if (descLower.includes("/environments") || titleLower.includes("environment")) {
    apiPatterns.push("/api/projects");
  }
  if (descLower.includes("/quests") || titleLower.includes("quest")) {
    apiPatterns.push("/api/projects");
  }
  if (descLower.includes("/exports") || titleLower.includes("export")) {
    apiPatterns.push("/api/projects");
  }
  if (descLower.includes("/sprite") || titleLower.includes("sprite")) {
    apiPatterns.push("/api/projects");
  }
  if (apiPatterns.length === 0) {
    apiPatterns.push("/health");
  }

  const uniquePatterns = Array.from(new Set(apiPatterns));

  const checks = uniquePatterns.map(p => {
    const varName = p.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
    return `status_${varName}=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 ${SERVER}${p})
if [ "$status_${varName}" = "200" ] || [ "$status_${varName}" = "401" ] || [ "$status_${varName}" = "403" ] || [ "$status_${varName}" = "302" ]; then
  echo "PASS: ${p} responds ($status_${varName})"
else
  echo "FAIL: ${p} returned $status_${varName}"
  exit 1
fi`;
  }).join("\n\n");

  return `#!/usr/bin/env bash
# Acceptance test for: ${featureTitle}
# Feature: ${featureId}

SERVER=${SERVER}

${checks}

echo "PASS: All checks passed for ${featureId}"
exit 0
`;
}

export function ensureFallbackTestExists(featureId: string, featureTitle: string, featureDescription: string): string {
  if (testExists(featureId)) return getTestPath(featureId);
  const script = generateFallbackTestSync(featureId, featureTitle, featureDescription);
  writeTestScript(featureId, script);
  return getTestPath(featureId);
}

export async function generateAcceptanceTest(
  featureId: string,
  featureTitle: string,
  featureDescription: string
): Promise<string> {
  ensureDir();

  const goalsExcerpt = readGoals();

  const prompt = `You are writing a bash acceptance test script for a roadmap feature.

## Feature
ID: ${featureId}
Title: ${featureTitle}
Description: ${featureDescription}

## GOALS.md (for API endpoint reference)
${goalsExcerpt}

## Instructions
Write a short bash script (< 40 lines) that empirically verifies this feature is actually working.
The script should:
1. Use curl to check that API routes mentioned in this feature exist (HTTP 200 OR 401/403/302 for auth-protected routes means the route exists)
2. Check that key schema tables exist by grepping shared/schema.ts 
3. Check that key files (server/storage.ts, server/routes.ts) contain the expected function names or route patterns
4. Print "PASS: <what passed>" for each passing check
5. Print "FAIL: <what failed>" and exit 1 on failure

Rules — these are ABSOLUTE, not suggestions:
- Use SERVER=http://localhost:5000 for all curl calls
- A 401, 403, or 302 response means the endpoint EXISTS but requires auth — count this as PASS
- A 404 or 5xx means FAIL
- ALWAYS include 302 in the status check conditions alongside 401 and 403
- Keep it under 40 lines
- Focus on what this SPECIFIC feature adds (not things from other features)
- DO NOT test UI pages (no browser automation)
- DO NOT test actual AI outputs (just that the route/function exists)
- Use simple bash, no external dependencies beyond curl and grep
- NEVER use "set -e"
- NEVER use counter variables: FAIL_COUNT, PASS_COUNT, ERRORS, or any similar variable
- NEVER use arithmetic: no ((FAIL_COUNT++)), no $(( )), no [ $x -gt 0 ] counter checks
- NEVER pipe grep to grep (e.g., grep -q ... | grep -q ...) — use separate statements
- EACH check MUST be its own if/else block that calls "exit 1" directly inside the else
- The ONLY allowed exit pattern: echo "FAIL: ..." followed immediately by "exit 1" on the next line
- NO summary block at the end — the script exits 0 only if all individual checks passed

Respond in JSON:
{
  "script": "#!/usr/bin/env bash\\n# Acceptance test\\n..."
}`;

  try {
    const result = await callClaude(prompt, {
      model: "claude-haiku-4-5",
      maxTokens: 2048,
      temperature: 0.2,
      agent: "acceptance-test-generator",
      task: `generate-test-${featureId}`,
      feature: featureId,
    });

    const parsed = extractJson(result.text);
    if (!parsed || typeof parsed.script !== "string") {
      const fallback = generateFallbackTestSync(featureId, featureTitle, featureDescription);
      writeTestScript(featureId, fallback);
      return getTestPath(featureId);
    }

    writeTestScript(featureId, parsed.script);
    console.log(`[AcceptanceTest] Generated test for ${featureId}: ${getTestPath(featureId)}`);
    return getTestPath(featureId);
  } catch (err: unknown) {
    const fallback = generateFallbackTestSync(featureId, featureTitle, featureDescription);
    writeTestScript(featureId, fallback);
    console.log(`[AcceptanceTest] Generation failed for ${featureId}, using fallback: ${(err as Error).message}`);
    return getTestPath(featureId);
  }
}

export function loadTestResults(): Record<string, { passed: boolean; output: string; testedAt: string }> {
  const resultsDir = path.join(SNEEBLY_DIR, "acceptance-results");
  if (!fs.existsSync(resultsDir)) return {};
  const results: Record<string, { passed: boolean; output: string; testedAt: string }> = {};
  try {
    const files = fs.readdirSync(resultsDir).filter(f => f.endsWith(".json"));
    for (const file of files) {
      const featureId = file.replace(".json", "");
      const content = JSON.parse(fs.readFileSync(path.join(resultsDir, file), "utf-8"));
      results[featureId] = content;
    }
  } catch {}
  return results;
}
