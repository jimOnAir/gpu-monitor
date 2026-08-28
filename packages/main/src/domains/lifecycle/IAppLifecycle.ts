/**
 * Adapter interface for app-level lifecycle events.
 * Keeps the lifecycle domain free of electron imports.
 */
export interface IAppLifecycle {
  onSecondInstance: (callback: () => void) => void;
  onActivate: (callback: () => void) => void;
  onBeforeQuit: (callback: () => void) => void;
  quit: () => void;
  relaunch: () => void;
  exit: (code: number) => void;
}
