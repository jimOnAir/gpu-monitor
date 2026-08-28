export interface IDialogOptions {
  type: 'warning' | 'error' | 'info';
  title: string;
  message: string;
  detail?: string;
  buttons: string[];
  defaultId?: number;
  cancelId?: number;
}

/**
 * Adapter interface for native message dialogs.
 * Keeps the recovery domain free of electron imports.
 */
export interface IDialogAdapter {
  showMessageBox: (options: IDialogOptions) => Promise<{ response: number }>;
}
