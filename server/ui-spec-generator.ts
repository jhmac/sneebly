import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".sneebly");
const UI_SPEC_FILE = path.join(DATA_DIR, "ui-spec.json");
const APP_TSX = path.join(process.cwd(), "client", "src", "App.tsx");
const CLIENT_SRC = path.join(process.cwd(), "client", "src");

export interface ElementAssertion {
  shouldBePresent: boolean;
  shouldBeInteractable: boolean;
  shouldNotCrashOnInteraction: boolean;
  notes: string;
}

export interface UiElement {
  testId: string;
  tag: string;
  inferredPurpose: string;
  type: "button" | "input" | "link" | "form" | "select" | "textarea" | "other";
  assertions: ElementAssertion;
}

export interface UiRoute {
  path: string;
  component: string;
  requiresAuth: boolean;
  authReason: string | null;
  expectedOutcome: string;
  elements: UiElement[];
  filePath: string | null;
}

export interface UiSpec {
  generatedAt: string;
  routes: UiRoute[];
  totalElements: number;
  version: number;
}

function inferPurpose(testId: string): string {
  const id = testId.toLowerCase();
  if (id.startsWith("button-")) return `triggers ${id.replace("button-", "").replace(/-/g, " ")} action`;
  if (id.startsWith("btn-")) return `triggers ${id.replace("btn-", "").replace(/-/g, " ")} action`;
  if (id.startsWith("input-")) return `accepts ${id.replace("input-", "").replace(/-/g, " ")} input`;
  if (id.startsWith("link-")) return `navigates to ${id.replace("link-", "").replace(/-/g, " ")}`;
  if (id.startsWith("form-")) return `submits ${id.replace("form-", "").replace(/-/g, " ")} form`;
  if (id.startsWith("select-")) return `selects ${id.replace("select-", "").replace(/-/g, " ")} option`;
  if (id.startsWith("text-")) return `displays ${id.replace("text-", "").replace(/-/g, " ")}`;
  if (id.startsWith("img-")) return `shows ${id.replace("img-", "").replace(/-/g, " ")} image`;
  if (id.startsWith("card-")) return `card for ${id.replace("card-", "").replace(/-/g, " ")}`;
  if (id.startsWith("tab-")) return `switches to ${id.replace("tab-", "").replace(/-/g, " ")} tab`;
  if (id.startsWith("modal-")) return `controls ${id.replace("modal-", "").replace(/-/g, " ")} modal`;
  if (id.startsWith("status-")) return `shows ${id.replace("status-", "").replace(/-/g, " ")} status`;
  if (id.includes("submit")) return "submits the form";
  if (id.includes("cancel")) return "cancels the current action";
  if (id.includes("close")) return "closes the dialog or panel";
  if (id.includes("open")) return "opens the dialog or panel";
  if (id.includes("create")) return "creates a new item";
  if (id.includes("delete") || id.includes("remove")) return "deletes or removes an item";
  if (id.includes("edit") || id.includes("update")) return "edits or updates an item";
  if (id.includes("save")) return "saves current changes";
  if (id.includes("search")) return "searches or filters content";
  if (id.includes("generate")) return "triggers generation action";
  if (id.includes("upload")) return "uploads a file";
  if (id.includes("download")) return "downloads content";
  if (id.includes("export")) return "exports data";
  if (id.includes("import")) return "imports data";
  if (id.includes("toggle")) return "toggles a setting or state";
  if (id.includes("refresh") || id.includes("reload")) return "refreshes content";
  if (id.includes("next")) return "advances to next step or page";
  if (id.includes("prev") || id.includes("back")) return "goes back to previous step or page";
  return `interactive element: ${id.replace(/-/g, " ")}`;
}

function inferElementType(tag: string, testId: string, ariaRole?: string): UiElement["type"] {
  const id = testId.toLowerCase();
  // ARIA role takes priority over tag/id heuristics for non-semantic elements
  if (ariaRole) {
    if (ariaRole === "button") return "button";
    if (ariaRole === "link") return "link";
    if (ariaRole === "textbox" || ariaRole === "searchbox" || ariaRole === "spinbutton") return "input";
    if (ariaRole === "combobox" || ariaRole === "listbox") return "select";
  }
  if (tag === "button" || id.startsWith("button-") || id.startsWith("btn-")) return "button";
  if (tag === "input") return "input";
  if (tag === "a" || id.startsWith("link-")) return "link";
  if (tag === "form" || id.startsWith("form-")) return "form";
  if (tag === "select" || id.startsWith("select-")) return "select";
  if (tag === "textarea") return "textarea";
  // Fallback: infer from testId naming conventions
  if (id.startsWith("button-") || id.startsWith("btn-") || id.includes("-btn")) return "button";
  if (id.startsWith("input-") || id.startsWith("field-")) return "input";
  if (id.startsWith("link-") || id.startsWith("nav-")) return "link";
  return "other";
}

function buildAssertions(testId: string, type: UiElement["type"]): ElementAssertion {
  const isInteractable = type === "button" || type === "link" || type === "input" || type === "select" || type === "textarea" || type === "form";
  const notes = `${inferPurpose(testId)} — expect element to be found and ${isInteractable ? "interactable" : "visible"} without causing errors`;
  return {
    shouldBePresent: true,
    shouldBeInteractable: isInteractable,
    shouldNotCrashOnInteraction: isInteractable,
    notes,
  };
}

function extractTestIds(fileContent: string): UiElement[] {
  const elements: UiElement[] = [];
  const seen = new Set<string>();

  // Match opening tags that have data-testid, capturing the entire opening tag content
  // so we can extract both tag name and role attribute
  const tagContext = /<(\w+)([^>]*)data-testid=["'`]([^"'`]+)["'`]([^>]*)/g;

  const tagMap = new Map<string, string>();
  const roleMap = new Map<string, string>();
  let match;
  while ((match = tagContext.exec(fileContent)) !== null) {
    const [, tagName, beforeAttr, testId, afterAttr] = match;
    tagMap.set(testId, tagName.toLowerCase());
    // Extract role="..." from the rest of the tag attributes
    const roleMatch = (beforeAttr + afterAttr).match(/role=["'`]([^"'`]+)["'`]/);
    if (roleMatch) roleMap.set(testId, roleMatch[1].toLowerCase());
  }

  const allTestIds = new Set<string>();
  const simpleRegex = /data-testid=["'`]([^"'`]+)["'`]/g;
  while ((match = simpleRegex.exec(fileContent)) !== null) {
    allTestIds.add(match[1]);
  }

  for (const testId of Array.from(allTestIds)) {
    if (seen.has(testId)) continue;
    seen.add(testId);

    const tag = tagMap.get(testId) || "div";
    const ariaRole = roleMap.get(testId);
    const type = inferElementType(tag, testId, ariaRole);
    elements.push({
      testId,
      tag,
      inferredPurpose: inferPurpose(testId),
      type,
      assertions: buildAssertions(testId, type),
    });
  }

  return elements;
}

function detectTopLevelAuthWrapper(): { allRoutesRequireAuth: boolean; reason: string | null } {
  try {
    const content = fs.readFileSync(APP_TSX, "utf-8");
    // Detect if the Router component is wrapped in <SignedIn> or <PrivateRoute> at top level
    const signedInWrapsRouter = /<SignedIn[^>]*>[\s\S]*?<Router\s*\/>[\s\S]*?<\/SignedIn>/.test(content);
    const signedInWrapsSwitch = /<SignedIn[^>]*>[\s\S]*?<Switch[\s\S]*?<\/SignedIn>/.test(content);
    if (signedInWrapsRouter || signedInWrapsSwitch) {
      return { allRoutesRequireAuth: true, reason: "entire Router is wrapped in <SignedIn> in App.tsx" };
    }
    // Also check for ClerkProvider + RequireAuth patterns
    const requireAuthWrap = /<RequireAuth[^>]*>[\s\S]*?<Router/.test(content);
    if (requireAuthWrap) {
      return { allRoutesRequireAuth: true, reason: "entire Router is wrapped in <RequireAuth> in App.tsx" };
    }
  } catch {}
  return { allRoutesRequireAuth: false, reason: null };
}

function parseRoutesFromAppTsx(): Array<{ path: string; component: string }> {
  const routes: Array<{ path: string; component: string }> = [];
  try {
    const content = fs.readFileSync(APP_TSX, "utf-8");
    const routeRegex = /<Route\s+path=["'`]([^"'`]+)["'`]\s+component=\{(\w+)\}/g;
    let match;
    while ((match = routeRegex.exec(content)) !== null) {
      routes.push({ path: match[1], component: match[2] });
    }
    const altRouteRegex = /<Route\s+component=\{(\w+)\}\s+path=["'`]([^"'`]+)["'`]/g;
    while ((match = altRouteRegex.exec(content)) !== null) {
      routes.push({ path: match[2], component: match[1] });
    }
  } catch {}
  return routes;
}

function findComponentFile(componentName: string): string | null {
  const extensions = [".tsx", ".ts", ".jsx", ".js"];
  const dirs = [
    path.join(CLIENT_SRC, "pages"),
    path.join(CLIENT_SRC, "components"),
    CLIENT_SRC,
  ];

  for (const dir of dirs) {
    for (const ext of extensions) {
      const full = path.join(dir, `${componentName}${ext}`);
      if (fs.existsSync(full)) return full;
    }
  }
  return null;
}

function parseComponentOutcomes(componentFilePath: string): string[] {
  const outcomes: string[] = [];
  try {
    const content = fs.readFileSync(componentFilePath, "utf-8");

    // Redirect / navigation after action
    const navigateMatches = Array.from(content.matchAll(/navigate\(["'`]([^"'`]{1,60})["'`]\)/g));
    for (const m of navigateMatches.slice(0, 2)) {
      outcomes.push(`may navigate to "${m[1]}" after action`);
    }
    const routerPushMatches = Array.from(content.matchAll(/router\.push\(["'`]([^"'`]{1,60})["'`]\)/g));
    for (const m of routerPushMatches.slice(0, 2)) {
      outcomes.push(`may navigate to "${m[1]}" after action`);
    }

    // Toast / success messages
    const toastMatch = content.match(/toast(?:\.success)?\(["'`]([^"'`]{5,80})["'`]\)/);
    if (toastMatch) outcomes.push(`shows success toast: "${toastMatch[1]}"`);

    // Form submission
    if (/onSubmit|handleSubmit/.test(content)) {
      outcomes.push("contains form with submission handler — submit should not crash");
    }

    // Data loading / async
    if (/useQuery|useSWR|useEffect[\s\S]{0,200}fetch\(|axios\.get/.test(content)) {
      outcomes.push("loads data asynchronously — should render loaded content without errors");
    }

    // Error state rendering
    const errorTextMatch = content.match(/["'`]((?:Error|Failed|Something went wrong)[^"'`]{0,60})["'`]/i);
    if (errorTextMatch) outcomes.push(`has error state text: "${errorTextMatch[1].slice(0, 60)}"`);

    // Conditional rendering / empty state
    if (/\.length\s*===?\s*0|!data|isLoading/.test(content)) {
      outcomes.push("has conditional rendering — should handle empty/loading states");
    }
  } catch {}
  return outcomes;
}

function isAuthRequired(componentFilePath: string): boolean {
  try {
    const content = fs.readFileSync(componentFilePath, "utf-8");
    return (
      content.includes("useAuth") ||
      content.includes("requireAuth") ||
      content.includes("SignedIn") ||
      content.includes("useUser") ||
      content.includes("getAuth")
    );
  } catch {
    return false;
  }
}

function walkDir(dir: string, ext: string[], ignore: string[]): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!ignore.includes(entry.name)) {
          results.push(...walkDir(full, ext, ignore));
        }
      } else if (entry.isFile()) {
        const e = path.extname(entry.name).toLowerCase();
        if (ext.includes(e) && !entry.name.includes(".test.") && !entry.name.includes(".spec.")) {
          results.push(full);
        }
      }
    }
  } catch {}
  return results;
}

function scanAllComponentFiles(): Map<string, UiElement[]> {
  const result = new Map<string, UiElement[]>();
  try {
    const files = walkDir(CLIENT_SRC, [".tsx", ".jsx"], ["node_modules", "__tests__"]);
    for (const full of files) {
      try {
        const content = fs.readFileSync(full, "utf-8");
        const elements = extractTestIds(content);
        if (elements.length > 0) {
          result.set(full, elements);
        }
      } catch {}
    }
  } catch {}
  return result;
}

export async function generateUiSpec(): Promise<UiSpec> {
  console.log("[UI Spec] Generating UI spec from source code...");

  const rawRoutes = parseRoutesFromAppTsx();
  const componentFileElements = scanAllComponentFiles();
  const topLevelAuth = detectTopLevelAuthWrapper();

  if (topLevelAuth.allRoutesRequireAuth) {
    console.log(`[UI Spec] Top-level auth detected: ${topLevelAuth.reason}`);
  }

  const routes: UiRoute[] = [];

  for (const r of rawRoutes) {
    const componentFile = findComponentFile(r.component);
    let elements: UiElement[] = [];
    let requiresAuth = topLevelAuth.allRoutesRequireAuth;
    let authReason: string | null = topLevelAuth.allRoutesRequireAuth ? topLevelAuth.reason : null;

    if (componentFile) {
      // Also check component-level auth markers (union with top-level detection)
      if (!requiresAuth && isAuthRequired(componentFile)) {
        requiresAuth = true;
        authReason = "component uses auth hooks/guards";
      }
      const fileElements = componentFileElements.get(componentFile);
      if (fileElements) elements = fileElements;

      if (elements.length === 0) {
        try {
          const content = fs.readFileSync(componentFile, "utf-8");
          elements = extractTestIds(content);
        } catch {}
      }
    }

    let expectedOutcome: string;
    if (requiresAuth) {
      expectedOutcome = "route should redirect to sign-in page or render an auth wall when accessed without credentials";
    } else {
      const componentOutcomes = componentFile ? parseComponentOutcomes(componentFile) : [];
      const baseOutcome = `route should load successfully, render ${r.component} component, and all ${elements.length} element(s) should be present and functional`;
      expectedOutcome = componentOutcomes.length > 0
        ? `${baseOutcome}; also: ${componentOutcomes.slice(0, 3).join("; ")}`
        : baseOutcome;
    }

    routes.push({
      path: r.path,
      component: r.component,
      requiresAuth,
      authReason,
      expectedOutcome,
      elements,
      filePath: componentFile ? path.relative(process.cwd(), componentFile) : null,
    });
  }

  if (routes.length === 0) {
    routes.push({
      path: "/",
      component: "App",
      requiresAuth: false,
      authReason: null,
      expectedOutcome: "route should load successfully and render the App component",
      elements: [],
      filePath: "client/src/App.tsx",
    });
  }

  const totalElements = routes.reduce((sum, r) => sum + r.elements.length, 0);
  const spec: UiSpec = {
    generatedAt: new Date().toISOString(),
    routes,
    totalElements,
    version: 1,
  };

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(UI_SPEC_FILE, JSON.stringify(spec, null, 2), "utf-8");
  console.log(`[UI Spec] Generated: ${routes.length} routes, ${totalElements} elements → ${UI_SPEC_FILE}`);
  return spec;
}

export function loadUiSpec(): UiSpec | null {
  try {
    if (!fs.existsSync(UI_SPEC_FILE)) return null;
    return JSON.parse(fs.readFileSync(UI_SPEC_FILE, "utf-8"));
  } catch {
    return null;
  }
}
