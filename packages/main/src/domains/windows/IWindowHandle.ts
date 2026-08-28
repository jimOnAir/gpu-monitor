/**
 * Domain-level abstraction over a platform window.
 * Keeps IWindowService and its callers free of electron types.
 */
export interface IWindowHandle {
  show: () => void;
  hide: () => void;
  focus: () => void;
  isMinimized: () => boolean;
  restore: () => void;
  isVisible: () => boolean;
  close: () => void;
  send: (channel: string, ...args: unknown[]) => void;
}
