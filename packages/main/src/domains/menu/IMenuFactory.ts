export interface IMenuFactory {
  buildFromTemplate: (template: unknown) => unknown;
  setApplicationMenu: (menu: unknown) => void;
}
