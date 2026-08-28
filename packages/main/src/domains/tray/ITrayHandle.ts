/**
 * Domain-level abstraction over the platform tray object.
 * Keeps ITrayService free of electron types.
 */
export interface ITrayHandle {
  setToolTip: (tooltip: string) => void;
  setImage: (image: unknown) => void;
  on: (event: 'click' | 'double-click', listener: () => void) => void;
  setContextMenu: (menu: unknown) => void;
}
