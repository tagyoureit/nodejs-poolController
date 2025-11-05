/**
 * Express Request augmentation for multer 2.x single/multiple file uploads.
 * Added because our tsconfig include patterns did not pick up multer's
 * automatic merging of Request.file / Request.files.
 */
import 'express';
// Minimal subset of Multer's File definition; adjust if needed.
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
  destination?: string;
  filename?: string;
  path?: string;
  stream?: NodeJS.ReadableStream;
}

declare global {
  namespace Express {
    interface Request {
      /** Populated by multer single(field) */
      file?: MulterFile;
      /** Populated by multer array(field)/fields()/any() */
      files?: MulterFile[] | { [fieldname: string]: MulterFile[] };
    }
  }
}

export {};
