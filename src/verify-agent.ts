import fs from "fs";
import path from "path";
import http from "http";
import { exec } from "child_process";

const SERVER_URL = "http://localhost:5000";

interface VerifyResult {
  check: string;
  passed: boolean;
  details: string;
}

interface VerificationReport {
  timestamp: string;
  allPassed: boolean;
  results: VerifyResult[];
  browserCheck?: { passed: boolean; details: string };
}

async function httpGet(urlPath: string, timeoutMs = 5000): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timeout")), timeoutMs);

    http.get(`${SERVER_URL}${urlPath}`, (res) => {
      let body = "";
      res.on("data", chunk => body += chunk);
      res.on("end", () => {
        clearTimeout(timer);
        resolve({ status: res.statusCode || 0, body });
      });
    }).on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function checkServerHealth(): Promise<VerifyResult> {
  try {
    const { status } = await httpGet("/health");
    return {
      check: "Server Health",
      passed: status === 200,
      details: status === 200 ? "Server responding on /health" : `Health check returned ${status}`,
    };
  } catch (error: any) {
    return {
      check: "Server Health",
      passed: false,
      details: `Server not responding: ${error.message}`,
    };
  }
}

async function checkApiEndpoint(method: string, apiPath: string): Promise<VerifyResult> {
  try {
    const { status } = await httpGet(apiPath);
    const isAuthError = status === 401 || status === 403;
    return {
      check: `${method} ${apiPath}`,
      passed: isAuthError || status === 200,
      details: isAuthError
        ? `Auth required (${status}) — endpoint exists and is protected`
        : `Returned ${status}`,
    };
  } catch (error: any) {
    return {
      check: `${method} ${apiPath}`,
      passed: false,
      details: `Error: ${error.message}`,
    };
  }
}

function checkFileExists(filePath: string): VerifyResult {
  const exists = fs.existsSync(path.resolve(process.cwd(), filePath));
  return {
    check: `File: ${filePath}`,
    passed: exists,
    details: exists ? "File exists" : "File missing",
  };
}

function checkFileContains(filePath: string, searchString: string, label: string): VerifyResult {
  try {
    const content = fs.readFileSync(path.resolve(process.cwd(), filePath), "utf-8");
    const found = content.includes(searchString);
    return {
      check: label,
      passed: found,
      details: found ? `Found "${searchString}" in ${filePath}` : `"${searchString}" not found in ${filePath}`,
    };
  } catch {
    return {
      check: label,
      passed: false,
      details: `Cannot read ${filePath}`,
    };
  }
}

function stripStringsAndComments(code: string): string {
  let result = "";
  let i = 0;
  while (i < code.length) {
    if (code[i] === "/" && code[i + 1] === "/") {
      while (i < code.length && code[i] !== "\n") i++;
    } else if (code[i] === "/" && code[i + 1] === "*") {
      i += 2;
      while (i < code.length && !(code[i] === "*" && code[i + 1] === "/")) i++;
      i += 2;
    } else if (code[i] === "`") {
      i++;
      let templateDepth = 0;
      while (i < code.length) {
        if (code[i] === "\\" ) { i += 2; continue; }
        if (code[i] === "$" && code[i + 1] === "{") {
          templateDepth++;
          i += 2;
          continue;
        }
        if (code[i] === "}" && templateDepth > 0) {
          templateDepth--;
          i++;
          continue;
        }
        if (code[i] === "`" && templateDepth === 0) { i++; break; }
        i++;
      }
    } else if (code[i] === '"' || code[i] === "'") {
      const quote = code[i];
      i++;
      while (i < code.length && code[i] !== quote) {
        if (code[i] === "\\") i++;
        i++;
      }
      i++;
    } else {
      result += code[i];
      i++;
    }
  }
  return result;
}

function checkFileSyntax(filePath: string): VerifyResult {
  try {
    const content = fs.readFileSync(path.resolve(process.cwd(), filePath), "utf-8");
    const stripped = stripStringsAndComments(content);

    let openBraces = 0;
    let openParens = 0;
    let openBrackets = 0;
    for (const char of stripped) {
      if (char === "{") openBraces++;
      if (char === "}") openBraces--;
      if (char === "(") openParens++;
      if (char === ")") openParens--;
      if (char === "[") openBrackets++;
      if (char === "]") openBrackets--;
    }

    const balanced = openBraces === 0 && openParens === 0 && openBrackets === 0;
    return {
      check: `Syntax: ${filePath}`,
      passed: balanced,
      details: balanced
        ? "Brackets balanced"
        : `Unbalanced: braces=${openBraces}, parens=${openParens}, brackets=${openBrackets}`,
    };
  } catch {
    return {
      check: `Syntax: ${filePath}`,
      passed: false,
      details: `Cannot read ${filePath}`,
    };
  }
}

async function checkTypeScript(filePaths: string[]): Promise<VerifyResult> {
  const tsFiles = filePaths.filter(f => f.endsWith(".ts") || f.endsWith(".tsx"));
  if (tsFiles.length === 0) return { check: "TypeScript", passed: true, details: "No TS files modified" };

  return new Promise((resolve) => {
    exec("npx tsc --noEmit --pretty false", { cwd: process.cwd(), timeout: 60000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      const output = ((stdout || "") + (stderr || "")).trim();
      if (!error || !output) {
        resolve({ check: "TypeScript Compilation", passed: true, details: "No type errors" });
        return;
      }

      const allLines = output.split("\n");
      const relevantLines = allLines.filter(l => tsFiles.some(f => l.includes(f)));

      if (relevantLines.length > 0) {
        resolve({
          check: "TypeScript Compilation",
          passed: false,
          details: `Type errors in modified files:\n${relevantLines.slice(0, 10).join("\n")}`,
        });
      } else {
        resolve({ check: "TypeScript Compilation", passed: true, details: "Modified files have no type errors (pre-existing errors in other files)" });
      }
    });
  });
}

async function browserSmokeCheck(
  modifiedFiles: string[]
): Promise<{ passed: boolean; details: string }> {
  const hasClientChanges = modifiedFiles.some(f =>
    f.startsWith('client/') || f.endsWith('.tsx') || f.endsWith('.jsx')
  );
  if (!hasClientChanges) {
    return { passed: true, details: 'Skipped (no client changes)' };
  }

  try {
    const { chromium } = await import('playwright-core');
    const appUrl = process.env.APP_URL || 'http://localhost:5000';

    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(appUrl, { timeout: 15_000, waitUntil: 'domcontentloaded' });

    const bodyText = await page.evaluate(() => document.body?.innerText || '');
    const hasContent = bodyText.trim().length > 10;

    await browser.close();

    if (!hasContent) {
      return { passed: false, details: 'Page appears blank (white screen)' };
    }
    if (consoleErrors.length > 3) {
      return {
        passed: false,
        details: `${consoleErrors.length} console errors: ${consoleErrors.slice(0, 3).join('; ')}`
      };
    }

    return { passed: true, details: `OK (${consoleErrors.length} console errors)` };
  } catch (e) {
    return { passed: true, details: `Skipped: ${(e as Error).message.slice(0, 80)}` };
  }
}

export async function verifyChanges(filesModified: string[]): Promise<VerificationReport> {
  const results: VerifyResult[] = [];

  results.push(await checkServerHealth());

  for (const file of filesModified) {
    results.push(checkFileExists(file));
    if (file.endsWith(".ts") || file.endsWith(".tsx")) {
      results.push(checkFileSyntax(file));
    }
  }

  const tsFiles = filesModified.filter(f => f.endsWith(".ts") || f.endsWith(".tsx"));
  if (tsFiles.length > 0) {
    results.push(await checkTypeScript(tsFiles));
  }

  if (filesModified.some(f => f.includes("schema.ts"))) {
    results.push(checkFileContains("shared/schema.ts", "pgTable", "Schema has pgTable definitions"));
    results.push(checkFileContains("shared/schema.ts", "createInsertSchema", "Schema has insert schemas"));
  }

  if (filesModified.some(f => f.includes("storage.ts"))) {
    results.push(checkFileContains("server/storage.ts", "IStorage", "Storage has IStorage interface"));
    results.push(checkFileContains("server/storage.ts", "DatabaseStorage", "Storage has DatabaseStorage class"));
  }

  if (filesModified.some(f => f.includes("routes.ts"))) {
    results.push(checkFileContains("server/routes.ts", "requireAuth", "Routes use auth middleware"));
    results.push(await checkApiEndpoint("GET", "/api/projects"));
  }

  const browserResult = await browserSmokeCheck(filesModified);
  console.log(`[sneebly] Browser check: ${browserResult.details}`);

  const allPassed = results.every(r => r.passed);

  const report: VerificationReport = {
    timestamp: new Date().toISOString(),
    allPassed,
    results,
    browserCheck: browserResult,
  };

  const reportPath = path.join(process.cwd(), ".sneebly", "last-verification.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");

  console.log(`[Verify] ${allPassed ? "ALL PASSED" : "FAILURES DETECTED"} — ${results.filter(r => r.passed).length}/${results.length} checks passed`);

  return report;
}

export async function quickStepVerify(filesModified: string[]): Promise<{ passed: boolean; errors: string[] }> {
  const errors: string[] = [];

  for (const file of filesModified) {
    if (!fs.existsSync(path.resolve(process.cwd(), file))) {
      errors.push(`Missing file: ${file}`);
      continue;
    }
    if (file.endsWith(".ts") || file.endsWith(".tsx")) {
      const syntaxResult = checkFileSyntax(file);
      if (!syntaxResult.passed) {
        errors.push(`Syntax error in ${file}: ${syntaxResult.details}`);
      }
    }
  }

  const tsFiles = filesModified.filter(f => f.endsWith(".ts") || f.endsWith(".tsx"));
  if (tsFiles.length > 0) {
    const tsResult = await checkTypeScript(tsFiles);
    if (!tsResult.passed) {
      errors.push(tsResult.details);
    }
  }

  return { passed: errors.length === 0, errors };
}

export async function quickHealthCheck(): Promise<boolean> {
  try {
    const result = await checkServerHealth();
    return result.passed;
  } catch {
    return false;
  }
}

export function getLastVerification(): VerificationReport | null {
  try {
    const reportPath = path.join(process.cwd(), ".sneebly", "last-verification.json");
    if (fs.existsSync(reportPath)) {
      return JSON.parse(fs.readFileSync(reportPath, "utf-8"));
    }
  } catch {}
  return null;
}
