export interface IHttpAdapter {
  getJson: <T = unknown>(url: string, timeoutMs?: number) => Promise<T | null>;
}
