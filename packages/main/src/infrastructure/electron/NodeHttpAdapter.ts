import * as http from 'http';

import type { Logger } from '../../logger';

export interface IHttpAdapter {
  getJson: <T = unknown>(url: string, timeoutMs?: number) => Promise<T | null>;
}

export class NodeHttpAdapter implements IHttpAdapter {
  constructor(private readonly logger: Logger) {}

  async getJson<T = unknown>(url: string, timeoutMs = 5000): Promise<T | null> {
    return new Promise((resolve) => {
      this.logger.debug({ url }, 'fetchJson start');
      const req = http.get(url, { family: 4, timeout: timeoutMs }, (res) => {
        this.logger.debug({ url, statusCode: res.statusCode }, 'fetchJson response');
        let data = '';
        res.on('data', (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on('end', () => {
          this.logger.debug({ url, dataLen: data.length }, 'fetchJson end');
          try {
            resolve(JSON.parse(data) as T);
          } catch {
            this.logger.error({ url }, 'fetchJson parse error');
            resolve(null);
          }
        });
      });
      req.on('error', (e) => {
        this.logger.error({ url, error: e.message }, 'fetchJson error');
        resolve(null);
      });
      req.on('timeout', () => {
        this.logger.error({ url }, 'fetchJson timeout');
        req.destroy();
        resolve(null);
      });
    });
  }
}
