import fs from "fs";
import path from "path";

const NODE_BUILTIN_MODULES = new Set([
  "assert", "async_hooks", "buffer", "child_process", "cluster", "console",
  "constants", "crypto", "dgram", "diagnostics_channel", "dns", "domain",
  "events", "fs", "http", "http2", "https", "inspector", "module", "net",
  "os", "path", "perf_hooks", "process", "punycode", "querystring",
  "readline", "repl", "stream", "string_decoder", "sys", "timers",
  "tls", "trace_events", "tty", "url", "util", "v8", "vm",
  "wasi", "worker_threads", "zlib",
]);

const SAFE_PACKAGE_NAME_RE = /^(@[a-z0-9][-a-z0-9]*\/)?[a-z0-9][-a-z0-9._]*$/i;

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)(?:\s+[\w*{},\s]+\s+from)?\s+['"]([^'"]+)['"]/g;
const REQUIRE_RE = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

export function isValidPackageName(name: string): boolean {
  return SAFE_PACKAGE_NAME_RE.test(name) && name.length <= 214;
}

function extractSpecifier(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith(".") || trimmed.startsWith("/")) return null;
  const parts = trimmed.startsWith("@") ? trimmed.split("/").slice(0, 2).join("/") : trimmed.split("/")[0];
  return parts || null;
}

function parseImportsFromSource(source: string): Set<string> {
  const specifiers = new Set<string>();
  for (const re of [IMPORT_RE, REQUIRE_RE, DYNAMIC_IMPORT_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      const spec = extractSpecifier(m[1]);
      if (spec) specifiers.add(spec);
    }
  }
  return specifiers;
}

function getInstalledPackages(): Set<string> {
  try {
    const pkgPath = path.join(process.cwd(), "package.json");
    if (!fs.existsSync(pkgPath)) return new Set();
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const deps = {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
      ...(pkg.peerDependencies || {}),
    };
    return new Set(Object.keys(deps));
  } catch {
    return new Set();
  }
}

export function detectMissingPackages(sources: string[]): string[] {
  const installed = getInstalledPackages();
  const missing = new Set<string>();

  for (const source of sources) {
    const specifiers = parseImportsFromSource(source);
    for (const spec of specifiers) {
      if (NODE_BUILTIN_MODULES.has(spec)) continue;
      if (installed.has(spec)) continue;
      if (!isValidPackageName(spec)) continue;
      missing.add(spec);
    }
  }

  return Array.from(missing);
}

export function extractMissingPackageFromError(errorText: string): string | null {
  const patterns = [
    /Cannot find module '([^']+)'/,
    /Cannot find module "([^"]+)"/,
    /Module not found: (?:Error: )?Can't resolve '([^']+)'/,
    /Module not found: (?:Error: )?Cannot find module '([^']+)'/,
    /Error: Cannot find module '([^']+)'/,
  ];

  for (const pat of patterns) {
    const m = errorText.match(pat);
    if (m) {
      const spec = extractSpecifier(m[1]);
      if (spec && isValidPackageName(spec) && !NODE_BUILTIN_MODULES.has(spec)) {
        return spec;
      }
    }
  }

  return null;
}
