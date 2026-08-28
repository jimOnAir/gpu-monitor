import { dialog } from 'electron';

import type { IDialogAdapter, IDialogOptions } from '../../domains/recovery/IDialogAdapter';

export class ElectronDialogAdapter implements IDialogAdapter {
  async showMessageBox(options: IDialogOptions): Promise<{ response: number }> {
    const result = await dialog.showMessageBox({
      type: options.type,
      title: options.title,
      message: options.message,
      detail: options.detail,
      buttons: options.buttons,
      defaultId: options.defaultId,
      cancelId: options.cancelId,
    });

    return { response: result.response };
  }
}
