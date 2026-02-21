import fs from "fs";
import path from "path";

const MEMORY_FILE = path.join(process.cwd(), ".sneebly", "memory.md");

function atomicWrite(filePath: string, content: string): void {
  const tmpFile = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmpFile, content, "utf-8");
  fs.renameSync(tmpFile, filePath);
}

interface MemorySection {
  title: string;
  content: string;
}

export function readMemory(): string {
  try {
    if (!fs.existsSync(MEMORY_FILE)) {
      fs.mkdirSync(path.dirname(MEMORY_FILE), { recursive: true });
      fs.writeFileSync(MEMORY_FILE, "# Sneebly Memory\n\n## Conventions\n\n## Mistakes\n\n## Fix Patterns\n\n## Progress\n");
    }
    return fs.readFileSync(MEMORY_FILE, "utf-8");
  } catch {
    return "";
  }
}

export function readMemorySection(sectionName: string): string {
  const full = readMemory();
  const regex = new RegExp(`## ${sectionName}\\n([\\s\\S]*?)(?=\\n## |$)`, "i");
  const match = full.match(regex);
  return match ? match[1].trim() : "";
}

export function parseMemorySections(): MemorySection[] {
  const full = readMemory();
  const sections: MemorySection[] = [];
  const parts = full.split(/\n## /);

  for (let i = 1; i < parts.length; i++) {
    const lines = parts[i].split("\n");
    const title = lines[0].trim();
    const content = lines.slice(1).join("\n").trim();
    sections.push({ title, content });
  }

  return sections;
}

export function appendToSection(sectionName: string, entry: string): void {
  const full = readMemory();
  const sectionHeader = `## ${sectionName}`;
  const idx = full.indexOf(sectionHeader);

  if (idx === -1) {
    const updated = full.trimEnd() + `\n\n${sectionHeader}\n\n${entry}\n`;
    atomicWrite(MEMORY_FILE, updated);
    return;
  }

  const afterHeader = idx + sectionHeader.length;
  const nextSection = full.indexOf("\n## ", afterHeader);
  const sectionEnd = nextSection === -1 ? full.length : nextSection;
  const currentContent = full.slice(afterHeader, sectionEnd);

  if (currentContent.includes(entry.trim())) return;

  const updated = full.slice(0, sectionEnd).trimEnd() + "\n" + entry + "\n" + full.slice(sectionEnd);
  atomicWrite(MEMORY_FILE, updated);
  updateTimestamp();
}

export function updateSection(sectionName: string, newContent: string): void {
  const full = readMemory();
  const sectionHeader = `## ${sectionName}`;
  const idx = full.indexOf(sectionHeader);

  if (idx === -1) {
    const updated = full.trimEnd() + `\n\n${sectionHeader}\n\n${newContent}\n`;
    atomicWrite(MEMORY_FILE, updated);
    return;
  }

  const afterHeader = idx + sectionHeader.length;
  const nextSection = full.indexOf("\n## ", afterHeader);
  const sectionEnd = nextSection === -1 ? full.length : nextSection;

  const updated = full.slice(0, afterHeader) + "\n\n" + newContent + "\n" + full.slice(sectionEnd);
  atomicWrite(MEMORY_FILE, updated);
  updateTimestamp();
}

function updateTimestamp(): void {
  const full = readMemory();
  const dateStr = new Date().toISOString().split("T")[0];
  const marker = `Last updated: `;
  if (full.includes(marker)) {
    const updated = full.replace(/Last updated: .+/, `${marker}${dateStr}`);
    atomicWrite(MEMORY_FILE, updated);
  } else {
    const updated = full.replace(/^(# Sneebly Memory)/, `$1\n_${marker}${dateStr}_`);
    atomicWrite(MEMORY_FILE, updated);
  }
}

export function addConvention(convention: string): void {
  appendToSection("Conventions", `- ${convention}`);
}

export function addFixPattern(pattern: string): void {
  appendToSection("Fix Patterns", `- ${pattern}`);
}

export function addBuildPattern(pattern: string): void {
  appendToSection("Build Patterns", `- ${pattern}`);
}

export function addMistake(mistake: string): void {
  appendToSection("Mistakes", `- ${mistake}`);
}

export function updateProjectState(stateUpdate: string): void {
  appendToSection("Project State", stateUpdate);
}

export function getMemoryForPrompt(sections?: string[]): string {
  if (!sections) return readMemory();

  return sections.map(s => {
    const content = readMemorySection(s);
    return content ? `## ${s}\n${content}` : "";
  }).filter(Boolean).join("\n\n");
}
