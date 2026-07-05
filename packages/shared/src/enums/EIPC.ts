/**
 * IPC channel name enum.
 * Used by main (handlers), preload (bridge), and renderer (via IElectronAPI).
 * Keep in sync with IpcInvokeMap and IpcEventMap.
 */
export enum EIPC {
  // --- Renderer-facing invoke channels (request/response) ---
  GET_SETTINGS = 'GET_SETTINGS',
  SAVE_SETTINGS = 'SAVE_SETTINGS',
  WINDOW_CLOSE = 'WINDOW_CLOSE',

  // --- Renderer-facing event channels (main → renderer push) ---
  GPU_DATA_UPDATE = 'GPU_DATA_UPDATE',
  OPEN_PREFERENCES = 'OPEN_PREFERENCES',

  // --- Auto-update events ---
  UPDATE_AVAILABLE = 'UPDATE_AVAILABLE',
  UPDATE_DOWNLOADED = 'UPDATE_DOWNLOADED',

  // --- Window focus/blur ---
  WINDOW_FOCUS = 'WINDOW_FOCUS',
  WINDOW_BLUR = 'WINDOW_BLUR',

  // --- Window close ---
  CLOSE_PREFERENCES = 'CLOSE_PREFERENCES',
}
