import { Octokit } from '@octokit/rest';
import fs from 'fs';
import path from 'path';

let connectionSettings: any;
async function getAccessToken() {
  if (connectionSettings?.settings?.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY ? 'repl ' + process.env.REPL_IDENTITY : process.env.WEB_REPL_RENEWAL ? 'depl ' + process.env.WEB_REPL_RENEWAL : null;
  if (!xReplitToken) throw new Error('X_REPLIT_TOKEN not found');
  connectionSettings = await fetch('https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github', { headers: { 'Accept': 'application/json', 'X_REPLIT_TOKEN': xReplitToken } }).then(res => res.json()).then(data => data.items?.[0]);
  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;
  if (!connectionSettings || !accessToken) throw new Error('GitHub not connected');
  return accessToken;
}

const OWNER = 'jhmac';
const REPO = 'sneebly';

const FILE_MAP: Record<string, string> = {
  'src/': 'server/',
  'templates/': '',
};

async function downloadFile(octokit: Octokit, repoPath: string): Promise<string | null> {
  try {
    const { data } = await octokit.repos.getContent({ owner: OWNER, repo: REPO, path: repoPath }) as any;
    if (data.type === 'file' && data.content) {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
  } catch {}
  return null;
}

async function listDir(octokit: Octokit, dirPath: string): Promise<string[]> {
  try {
    const { data } = await octokit.repos.getContent({ owner: OWNER, repo: REPO, path: dirPath }) as any;
    if (Array.isArray(data)) {
      return data.filter((f: any) => f.type === 'file').map((f: any) => f.path);
    }
  } catch {}
  return [];
}

async function main() {
  const token = await getAccessToken();
  const octokit = new Octokit({ auth: token });

  console.log(`Syncing from github.com/${OWNER}/${REPO}...\n`);

  const srcFiles = await listDir(octokit, 'src');
  const templateFiles = await listDir(octokit, 'templates');
  const allFiles = [...srcFiles, ...templateFiles];

  let updated = 0;
  let skipped = 0;

  for (const repoPath of allFiles) {
    const content = await downloadFile(octokit, repoPath);
    if (!content) {
      console.log(`  SKIP (no content): ${repoPath}`);
      skipped++;
      continue;
    }

    let localPath: string;
    if (repoPath.startsWith('src/')) {
      localPath = path.join(process.cwd(), 'server', repoPath.replace('src/', ''));
    } else if (repoPath.startsWith('templates/')) {
      localPath = path.join(process.cwd(), repoPath.replace('templates/', ''));
    } else {
      continue;
    }

    const dir = path.dirname(localPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (fs.existsSync(localPath)) {
      const existing = fs.readFileSync(localPath, 'utf-8');
      if (existing === content) {
        console.log(`  SAME: ${localPath}`);
        skipped++;
        continue;
      }

      const backupDir = path.join(process.cwd(), '.sneebly', 'backups', 'sync');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const safeName = path.relative(process.cwd(), localPath).replace(/[\/\\]/g, '__');
      fs.copyFileSync(localPath, path.join(backupDir, `${safeName}.${Date.now()}.bak`));
    }

    fs.writeFileSync(localPath, content, 'utf-8');
    console.log(`  UPDATED: ${localPath}`);
    updated++;
  }

  console.log(`\nDone! Updated ${updated} files, ${skipped} unchanged.`);
}

main().catch(console.error);
