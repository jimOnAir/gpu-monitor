import { shell } from 'electron';

import type { IExternalOpener } from '../../domains/windows/IExternalOpener';

export class ElectronExternalOpener implements IExternalOpener {
  open(url: string): void {
    shell.openExternal(url);
  }
}
