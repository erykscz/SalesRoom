import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename_s = fileURLToPath(import.meta.url);
const __dirname_s = path.dirname(__filename_s);
const uploadsBaseDir = path.resolve(__dirname_s, '../../../data/uploads');

const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;

/**
 * Create a multer upload middleware.
 * - Dev: saves to disk (data/uploads/{subdir}/)
 * - Production (Vercel): keeps file in memory buffer
 */
export function createUploadMiddleware(subdir = '', options = {}) {
  const { fileSize = 20 * 1024 * 1024, fileFilter } = options;

  let storage;
  if (useBlob) {
    storage = multer.memoryStorage();
  } else {
    const destDir = subdir ? path.join(uploadsBaseDir, subdir) : uploadsBaseDir;
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    storage = multer.diskStorage({
      destination: (req, file, cb) => cb(null, destDir),
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
      }
    });
  }

  return multer({ storage, limits: { fileSize }, fileFilter });
}

/**
 * Store a file after multer has processed it.
 * - Dev: file already on disk; returns local URL
 * - Production: uploads to Vercel Blob; returns blob URL
 *
 * Returns { url, storagePath }
 */
export async function storeFile(file, subdir = '') {
  if (useBlob) {
    const { put } = await import('@vercel/blob');
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    const pathname = subdir ? `${subdir}/${uniqueName}` : uniqueName;
    const { url } = await put(pathname, file.buffer, {
      access: 'public',
      contentType: file.mimetype,
    });
    return { url, storagePath: url };
  }

  // Disk mode — file already saved by multer
  const filename = path.basename(file.path);
  const url = subdir
    ? `/api/uploads/${subdir}/${filename}`
    : `/api/uploads/${filename}`;
  return { url, storagePath: file.path };
}

/**
 * Delete a file from storage.
 */
export async function deleteStoredFile(storagePath) {
  if (!storagePath) return;

  if (useBlob) {
    if (storagePath.startsWith('http')) {
      try {
        const { del } = await import('@vercel/blob');
        await del(storagePath);
      } catch (err) {
        console.error('Error deleting blob:', err);
      }
    }
  } else {
    try {
      if (fs.existsSync(storagePath)) {
        fs.unlinkSync(storagePath);
      }
    } catch (err) {
      console.error('Error deleting local file:', err);
    }
  }
}

/**
 * Get file contents as a Buffer for text extraction.
 * - Dev: reads from disk
 * - Production: returns the in-memory buffer
 */
export function getFileBuffer(file) {
  if (useBlob || file.buffer) {
    return file.buffer;
  }
  return fs.readFileSync(file.path);
}
