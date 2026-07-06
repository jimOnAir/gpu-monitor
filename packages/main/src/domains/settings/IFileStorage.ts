import type { WriteFileOptions } from 'fs';

export interface IFileStorage {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string, encoding: 'utf-8') => string;
  writeFileSync: (path: string, data: string, options?: WriteFileOptions) => void;
  mkdirSync: (path: string, options: { recursive: true }) => void;
  renameSync: (oldPath: string, newPath: string) => void;
}
