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
  OPEN_SETTINGS = 'OPEN_SETTINGS',
}
