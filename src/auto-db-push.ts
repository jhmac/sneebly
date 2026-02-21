import { exec } from "child_process";
import path from "path";
import fs from "fs";

const SCHEMA_PATH = path.join(process.cwd(), "shared", "schema.ts");
let lastSchemaHash = "";

function getFileHash(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const chr = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0;
    }
    return hash.toString(36);
  } catch {
    return "";
  }
}

function runDbPush(): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    console.log("[AutoDbPush] Schema change detected, running npm run db:push...");
    exec("npm run db:push", { cwd: process.cwd(), timeout: 30000 }, (error, stdout, stderr) => {
      const output = (stdout || "") + (stderr || "");
      if (error) {
        console.error("[AutoDbPush] db:push failed:", output);
        resolve({ success: false, output });
      } else {
        console.log("[AutoDbPush] db:push completed successfully");
        resolve({ success: true, output });
      }
    });
  });
}

export function setupAutoDbPush(): void {
  if (!fs.existsSync(SCHEMA_PATH)) {
    console.log("[AutoDbPush] shared/schema.ts not found, skipping watcher setup");
    return;
  }

  lastSchemaHash = getFileHash(SCHEMA_PATH);

  try {
    fs.watch(SCHEMA_PATH, async (eventType) => {
      if (eventType !== "change") return;

      const newHash = getFileHash(SCHEMA_PATH);
      if (newHash === lastSchemaHash || newHash === "") return;

      lastSchemaHash = newHash;

      await new Promise((r) => setTimeout(r, 2000));

      const finalHash = getFileHash(SCHEMA_PATH);
      if (finalHash !== newHash) {
        lastSchemaHash = finalHash;
        return;
      }

      const result = await runDbPush();

      const logEntry = {
        timestamp: new Date().toISOString(),
        event: "auto-db-push",
        success: result.success,
        output: result.output.slice(0, 500),
      };

      const logPath = path.join(process.cwd(), ".sneebly", "auto-db-push.log");
      try {
        fs.appendFileSync(logPath, JSON.stringify(logEntry) + "\n");
      } catch {}
    });

    console.log("[AutoDbPush] Watching shared/schema.ts for changes — will auto-run db:push");
  } catch (err) {
    console.error("[AutoDbPush] Failed to set up watcher:", err);
  }
}
