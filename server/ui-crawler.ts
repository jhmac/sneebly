import fs from "fs";
import path from "path";
import { generateUiSpec, loadUiSpec, type UiSpec, type UiRoute, type UiElement } from "./ui-spec-generator";

const DATA_DIR = path.join(process.cwd(), ".sneebly");
const UI_HEALTH_FILE = path.join(DATA_DIR, "ui-health.json");
const BLOCKERS_FILE = path.join(DATA_DIR, "blockers.json");

export interface ElementResult {
  testId: string;
  type: string;
  inferredPurpose: string;
  found: boolean;
  interacted: boolean;
  errors: string[];
  assertionsPassed: boolean;
  assertionViolations: string[];
}

export interface RouteResult {
  path: string;
  component: string;
  status: "pass" | "fail" | "skip" | "error";
  skipReason?: string;
  loadedOk: boolean;
  elementsFound: number;
  elementsTested: number;
  errorCount: number;
  consoleErrors: string[];
  networkErrors: string[];
  uncaughtExceptions: string[];
  elementResults: ElementResult[];
  durationMs: number;
}

export interface UiHealthReport {
  runAt: string;
  durationMs: number;
  status: "pass" | "fail" | "partial";
  routesTested: number;
  routesPassed: number;
  routesFailed: number;
  routesSkipped: number;
  totalElementsTested: number;
  totalErrors: number;
  routes: RouteResult[];
  criticalFailures: string[];
  specGeneratedAt: string | null;
}

function loadBlockers(): any[] {
  try {
    if (!fs.existsSync(BLOCKERS_FILE)) return [];
    return JSON.parse(fs.readFileSync(BLOCKERS_FILE, "utf-8")).blockers || [];
  } catch {
    return [];
  }
}

function saveBlockers(blockers: any[]): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    BLOCKERS_FILE,
    JSON.stringify({ blockers, lastUpdated: new Date().toISOString() }, null, 2),
    "utf-8"
  );
}

function addCrawlerBlocker(failure: { route: string; errors: string[]; type: string }): void {
  try {
    const blockers = loadBlockers();
    const id = `blk-ui-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    blockers.push({
      id,
      specId: `ui-crawler-${failure.route.replace(/\//g, "-")}`,
      specFile: UI_HEALTH_FILE,
      targetFile: failure.route,
      description: `UI crawler detected ${failure.type} on route "${failure.route}": ${failure.errors.slice(0, 2).join("; ")}`,
      reason: `Critical UI failure: ${failure.type}`,
      attempts: 1,
      userInstructions: [
        `Check the route "${failure.route}" in the browser for errors`,
        `Review the errors: ${failure.errors.slice(0, 3).join(", ")}`,
        `Fix the issue and run the UI scan again via the Command Center`,
        `Once resolved, mark this blocker as resolved in the Command Center`,
      ],
      suggestedSkill: null,
      createdAt: new Date().toISOString(),
      status: "active",
      source: "ui-crawler",
    });
    saveBlockers(blockers);
    console.log(`[UI Crawler] Created blocker ${id} for route ${failure.route}`);
  } catch (e) {
    console.log(`[UI Crawler] Failed to create blocker: ${(e as Error).message}`);
  }
}

let crawlRunning = false;

export function isCrawlRunning(): boolean {
  return crawlRunning;
}

export function loadUiHealth(): UiHealthReport | null {
  try {
    if (!fs.existsSync(UI_HEALTH_FILE)) return null;
    return JSON.parse(fs.readFileSync(UI_HEALTH_FILE, "utf-8"));
  } catch {
    return null;
  }
}

function saveUiHealth(report: UiHealthReport): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(UI_HEALTH_FILE, JSON.stringify(report, null, 2), "utf-8");
}

async function crawlRoute(
  page: any,
  route: UiRoute,
  appUrl: string
): Promise<RouteResult> {
  const start = Date.now();
  const consoleErrors: string[] = [];
  const networkErrors: string[] = [];
  const uncaughtExceptions: string[] = [];

  if (route.path.includes(":")) {
    return {
      path: route.path,
      component: route.component,
      status: "skip",
      skipReason: "dynamic route — requires specific ID",
      loadedOk: false,
      elementsFound: 0,
      elementsTested: 0,
      errorCount: 0,
      consoleErrors: [],
      networkErrors: [],
      uncaughtExceptions: [],
      elementResults: [],
      durationMs: Date.now() - start,
    };
  }

  const errorHandler = (msg: any) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text().slice(0, 200));
    }
  };
  page.on("console", errorHandler);

  const exceptionHandler = (err: Error) => {
    uncaughtExceptions.push(err.message.slice(0, 200));
  };
  page.on("pageerror", exceptionHandler);

  const networkHandler = (res: any) => {
    if (res.status() >= 500) {
      networkErrors.push(`${res.status()} ${res.url().slice(0, 150)}`);
    }
  };
  page.on("response", networkHandler);

  // Auth-required routes: visit the route to capture any runtime errors,
  // then verify the expected auth wall is present before skipping element testing
  if (route.requiresAuth) {
    try {
      const url = `${appUrl}${route.path}`;
      await page.goto(url, { timeout: 15_000, waitUntil: "domcontentloaded" });
      await page.waitForTimeout(800);

      const finalUrl = page.url();
      const bodyText: string = await page.evaluate(() => document.body?.innerText || "");

      // Detect auth wall: URL redirected to sign-in, or page shows auth indicators
      const redirectedToSignIn = /sign[-_]?in|login|auth|clerk/.test(finalUrl.toLowerCase());
      const clerkEl = await page.$("[data-clerk-sign-in], .cl-signIn-root, #clerk-components, [class*='clerk']").catch(() => null);
      const pageShowsAuthWall =
        bodyText.toLowerCase().includes("sign in") ||
        bodyText.toLowerCase().includes("log in") ||
        bodyText.toLowerCase().includes("sign up") ||
        clerkEl !== null;

      const authWallDetected = redirectedToSignIn || pageShowsAuthWall;
      const outcomeViolation = !authWallDetected
        ? `expected outcome not met: route loaded without auth wall — ${route.expectedOutcome}`
        : null;

      const totalErrors = consoleErrors.length + networkErrors.length + uncaughtExceptions.length;

      page.off("console", errorHandler);
      page.off("pageerror", exceptionHandler);
      page.off("response", networkHandler);

      const authRouteErrors = outcomeViolation ? [...networkErrors, outcomeViolation] : networkErrors;
      // Auth-wall missing is a security-relevant failure, not a benign skip
      const authStatus: RouteResult["status"] = authWallDetected ? "skip" : "fail";
      return {
        path: route.path,
        component: route.component,
        status: authStatus,
        skipReason: authWallDetected
          ? `auth required — visited and verified auth wall (redirected: ${redirectedToSignIn}, form: ${pageShowsAuthWall})`
          : undefined,
        loadedOk: bodyText.trim().length > 10,
        elementsFound: 0,
        elementsTested: 0,
        errorCount: totalErrors + (outcomeViolation ? 1 : 0),
        consoleErrors,
        networkErrors: authRouteErrors,
        uncaughtExceptions,
        elementResults: [],
        durationMs: Date.now() - start,
      };
    } catch (authErr) {
      page.off("console", errorHandler);
      page.off("pageerror", exceptionHandler);
      page.off("response", networkHandler);
      return {
        path: route.path,
        component: route.component,
        status: "skip",
        skipReason: `auth required — navigation failed: ${(authErr as Error).message.slice(0, 100)}`,
        loadedOk: false,
        elementsFound: 0,
        elementsTested: 0,
        errorCount: 1,
        consoleErrors,
        networkErrors,
        uncaughtExceptions,
        elementResults: [],
        durationMs: Date.now() - start,
      };
    }
  }

  const elementResults: ElementResult[] = [];
  let loadedOk = false;

  try {
    const url = `${appUrl}${route.path}`;
    await page.goto(url, { timeout: 15_000, waitUntil: "domcontentloaded" });

    const bodyText = await page.evaluate(() => document.body?.innerText || "");
    loadedOk = bodyText.trim().length > 10;

    await page.waitForTimeout(1000);

    for (const el of route.elements) {
      const elResult: ElementResult = {
        testId: el.testId,
        type: el.type,
        inferredPurpose: el.inferredPurpose,
        found: false,
        interacted: false,
        errors: [],
        assertionsPassed: true,
        assertionViolations: [],
      };

      const assertionViolations: string[] = [];

      try {
        const selector = `[data-testid="${el.testId}"]`;
        const handle = await page.$(selector);
        if (handle) {
          elResult.found = true;

          if (el.type === "button" || el.type === "link") {
            try {
              const beforeErrors = consoleErrors.length;
              const beforeExceptions = uncaughtExceptions.length;
              const urlBefore = page.url();
              await handle.click({ timeout: 3000 });
              await page.waitForTimeout(500);
              elResult.interacted = true;
              const afterErrors = consoleErrors.length;
              const afterExceptions = uncaughtExceptions.length;
              if (afterErrors > beforeErrors) {
                const newErrors = consoleErrors.slice(beforeErrors, afterErrors).map(e => `console error after click: ${e}`);
                elResult.errors.push(...newErrors);
                if (el.assertions?.shouldNotCrashOnInteraction) {
                  assertionViolations.push(`assertion violated: ${el.assertions.notes} — got ${newErrors.length} console error(s) after interaction`);
                }
              }
              if (afterExceptions > beforeExceptions) {
                const newExceptions = uncaughtExceptions.slice(beforeExceptions, afterExceptions);
                elResult.errors.push(...newExceptions.map(e => `uncaught exception after click: ${e}`));
                if (el.assertions?.shouldNotCrashOnInteraction) {
                  assertionViolations.push(`assertion violated: ${el.assertions.notes} — uncaught JS exception after interaction`);
                }
              }
              // Always re-navigate to the route URL to ensure subsequent elements are checked on the correct page
              if (page.url() !== urlBefore) {
                await page.goto(urlBefore, { timeout: 10_000, waitUntil: "domcontentloaded" }).catch(() => {});
                await page.waitForTimeout(300);
              }
            } catch (clickErr) {
              const msg = `click failed: ${(clickErr as Error).message.slice(0, 100)}`;
              elResult.errors.push(msg);
              if (el.assertions?.shouldBeInteractable) {
                assertionViolations.push(`assertion violated: ${el.assertions.notes} — element not interactable`);
              }
              // Re-navigate to ensure page state is correct even after failed click
              try {
                const currentRouteUrl = `${appUrl}${route.path}`;
                if (page.url() !== currentRouteUrl) {
                  await page.goto(currentRouteUrl, { timeout: 10_000, waitUntil: "domcontentloaded" }).catch(() => {});
                }
              } catch {}
            }
          } else if (el.type === "input" || el.type === "textarea") {
            try {
              await handle.fill("test-input", { timeout: 3000 });
              elResult.interacted = true;
            } catch (fillErr) {
              const msg = `fill failed: ${(fillErr as Error).message.slice(0, 100)}`;
              elResult.errors.push(msg);
              if (el.assertions?.shouldBeInteractable) {
                assertionViolations.push(`assertion violated: ${el.assertions.notes} — input not fillable`);
              }
            }
          } else if (el.type === "select") {
            elResult.interacted = true;
          } else {
            elResult.interacted = true;
          }
        } else {
          const msg = `element not found: [data-testid="${el.testId}"]`;
          elResult.errors.push(msg);
          if (el.assertions?.shouldBePresent) {
            assertionViolations.push(`assertion violated: ${el.assertions?.notes || el.testId} — element not found in DOM`);
          }
        }
      } catch (elErr) {
        elResult.errors.push(`element error: ${(elErr as Error).message.slice(0, 100)}`);
      }

      elResult.assertionViolations = assertionViolations;
      elResult.assertionsPassed = assertionViolations.length === 0;
      elementResults.push(elResult);
    }
  } catch (pageErr) {
    consoleErrors.push(`page error: ${(pageErr as Error).message.slice(0, 200)}`);
    loadedOk = false;
  }

  page.off("console", errorHandler);
  page.off("pageerror", exceptionHandler);
  page.off("response", networkHandler);

  const elementErrorCount = elementResults.reduce((sum, e) => sum + e.errors.length, 0);
  const assertionViolationCount = elementResults.reduce((sum, e) => sum + e.assertionViolations.length, 0);

  // Route-level outcome verification: verify the expected outcome was met
  const elementsExpected = route.elements.length;
  const elementsFound = elementResults.filter(e => e.found).length;
  const missingRatio = elementsExpected > 0 ? (elementsExpected - elementsFound) / elementsExpected : 0;
  const outcomeViolations: string[] = [];
  if (!loadedOk) {
    outcomeViolations.push(`expected outcome not met: ${route.expectedOutcome} — page failed to load`);
  } else if (missingRatio > 0.5 && elementsExpected > 0) {
    outcomeViolations.push(`expected outcome partially failed: ${route.expectedOutcome} — only ${elementsFound}/${elementsExpected} elements found`);
  }

  const totalErrors = consoleErrors.length + networkErrors.length + uncaughtExceptions.length + elementErrorCount + outcomeViolations.length;
  const hasPageCrash = !loadedOk;
  const hasCriticalApiErrors = networkErrors.some(e => e.startsWith("5"));
  const hasTooManyAssertionViolations = assertionViolationCount > 0 && assertionViolationCount > Math.floor((route.elements.length || 1) * 0.5);
  const hasOutcomeViolation = outcomeViolations.length > 0;
  const isFail = hasPageCrash || hasCriticalApiErrors || hasTooManyAssertionViolations || hasOutcomeViolation || consoleErrors.length + networkErrors.length + uncaughtExceptions.length > 5;

  return {
    path: route.path,
    component: route.component,
    status: isFail ? "fail" : "pass",
    loadedOk,
    elementsFound: elementResults.filter(e => e.found).length,
    elementsTested: elementResults.filter(e => e.interacted).length,
    errorCount: totalErrors,
    consoleErrors,
    networkErrors: outcomeViolations.length > 0 ? [...networkErrors, ...outcomeViolations] : networkErrors,
    uncaughtExceptions,
    elementResults,
    durationMs: Date.now() - start,
  };
}

export async function runUiCrawl(options: { regenerateSpec?: boolean } = {}): Promise<UiHealthReport> {
  if (crawlRunning) {
    throw new Error("UI crawl already running");
  }

  crawlRunning = true;
  const startTime = Date.now();

  try {
    let spec: UiSpec | null = null;
    if (options.regenerateSpec || !loadUiSpec()) {
      spec = await generateUiSpec();
    } else {
      spec = loadUiSpec();
    }

    if (!spec) {
      spec = {
        generatedAt: new Date().toISOString(),
        routes: [{
          path: "/",
          component: "App",
          requiresAuth: false,
          authReason: null,
          expectedOutcome: "route should load successfully and render the App component",
          elements: [],
          filePath: null,
        }],
        totalElements: 0,
        version: 1,
      };
    }

    console.log(`[UI Crawler] Starting crawl: ${spec.routes.length} routes, ${spec.totalElements} elements`);

    const { chromium } = await import("playwright-core");
    const appUrl = process.env.APP_URL || "http://localhost:5000";

    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    const routeResults: RouteResult[] = [];

    for (const route of spec.routes) {
      console.log(`[UI Crawler] Crawling: ${route.path} (${route.component})`);
      try {
        const result = await crawlRoute(page, route, appUrl);
        routeResults.push(result);
      } catch (e) {
        routeResults.push({
          path: route.path,
          component: route.component,
          status: "error",
          loadedOk: false,
          elementsFound: 0,
          elementsTested: 0,
          errorCount: 1,
          consoleErrors: [`crawl error: ${(e as Error).message.slice(0, 200)}`],
          networkErrors: [],
          uncaughtExceptions: [],
          elementResults: [],
          durationMs: 0,
        });
      }
    }

    await browser.close();

    const criticalFailures: string[] = [];
    for (const r of routeResults) {
      if (r.status === "fail" || r.status === "error") {
        const reasons: string[] = [];
        if (!r.loadedOk) reasons.push("page failed to load");
        if (r.networkErrors.length > 0) reasons.push(...r.networkErrors);
        if (r.uncaughtExceptions.length > 0) reasons.push(...r.uncaughtExceptions);
        if (r.consoleErrors.length > 3) reasons.push(`${r.consoleErrors.length} console errors`);

        if (reasons.length > 0) {
          criticalFailures.push(`${r.path}: ${reasons.slice(0, 2).join("; ")}`);
          addCrawlerBlocker({
            route: r.path,
            errors: reasons,
            type: !r.loadedOk ? "page crash" : r.networkErrors.length > 0 ? "API 500" : "JS errors",
          });
        }
      }
    }

    const passed = routeResults.filter(r => r.status === "pass").length;
    const failed = routeResults.filter(r => r.status === "fail" || r.status === "error").length;
    const skipped = routeResults.filter(r => r.status === "skip").length;

    const report: UiHealthReport = {
      runAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      status: failed > 0 ? (passed > 0 ? "partial" : "fail") : "pass",
      routesTested: routeResults.length,
      routesPassed: passed,
      routesFailed: failed,
      routesSkipped: skipped,
      totalElementsTested: routeResults.reduce((sum, r) => sum + r.elementsTested, 0),
      totalErrors: routeResults.reduce((sum, r) => sum + r.errorCount, 0),
      routes: routeResults,
      criticalFailures,
      specGeneratedAt: spec.generatedAt,
    };

    saveUiHealth(report);
    console.log(`[UI Crawler] Crawl complete: ${passed} passed, ${failed} failed, ${skipped} skipped, ${report.totalErrors} total errors`);
    return report;
  } finally {
    crawlRunning = false;
  }
}
