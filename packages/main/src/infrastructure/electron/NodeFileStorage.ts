import * as fs from 'fs';

import type { IFileStorage } from '../../domains/settings/IFileStorage';

/**
 * Node.js fs-based file storage implementation.
 * Bridges the domain IFileStorage interface to Node.js fs module.
 */
export class NodeFileStorage implements IFileStorage {
  existsSync(path: string): boolean {
    return fs.existsSync(path);
  }

  readFileSync(path: string, encoding: 'utf-8'): string {
    return fs.readFileSync(path, encoding);
  }

  writeFileSync(path: string, data: string, options?: fs.WriteFileOptions): void {
    fs.writeFileSync(path, data, options);
  }

  mkdirSync(path: string, options: { recursive: true }): void {
    fs.mkdirSync(path, options);
  }

  renameSync(oldPath: string, newPath: string): void {
    fs.renameSync(oldPath, newPath);
  }
}
