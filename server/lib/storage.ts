import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

// Ensure upload directory exists
export async function ensureUploadDir(): Promise<void> {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  } catch (error: unknown) {
    const err = error as Error;
    throw new Error(`Failed to create upload directory: ${err.message}`);
  }
}

// Upload file with null check on buffer
export async function uploadFile(file: { buffer: Buffer; originalname: string }): Promise<string> {
  if (!file.buffer) {
    throw new Error('File buffer is null or undefined');
  }

  await ensureUploadDir();
  const filename = `${Date.now()}-${file.originalname}`;
  const filepath = path.join(UPLOAD_DIR, filename);

  try {
    await fs.writeFile(filepath, file.buffer);
    return filename;
  } catch (error: unknown) {
    const err = error as Error;
    throw new Error(`Failed to upload file: ${err.message}`);
  }
}

// Delete file with type guard for path existence
export async function deleteFile(filename: string): Promise<void> {
  const filepath = path.join(UPLOAD_DIR, filename);

  // Type guard: check if path exists before deletion
  if (!existsSync(filepath)) {
    throw new Error(`File does not exist: ${filename}`);
  }

  try {
    await fs.unlink(filepath);
  } catch (error: unknown) {
    const err = error as Error;
    throw new Error(`Failed to delete file: ${err.message}`);
  }
}

// Get file path with existence check
export function getFilePath(filename: string): string {
  const filepath = path.join(UPLOAD_DIR, filename);

  // Type guard: verify file exists
  if (!existsSync(filepath)) {
    throw new Error(`File does not exist: ${filename}`);
  }

  return filepath;
}
