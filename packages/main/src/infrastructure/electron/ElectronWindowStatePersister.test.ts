import { beforeEach, describe, expect, it, vi } from 'vitest';

const saveState = vi.fn();
const manage = vi.fn();

vi.mock('electron-window-state', () => ({
  default: () => ({
    x: undefined,
    y: undefined,
    width: 800,
    height: 600,
    saveState,
    manage,
  }),
}));

import type { IWindowHandle } from '../../domains/windows/IWindowHandle';

import { ElectronWindowStatePersister } from './ElectronWindowStatePersister';

const fakeWindow = {
  getBounds: () => ({ x: 10, y: 20, width: 640, height: 480 }),
  isMaximized: () => false,
  isMinimized: () => false,
  isFullScreen: () => false,
} as unknown as IWindowHandle;

describe('ElectronWindowStatePersister', () => {
  beforeEach(() => {
    saveState.mockClear();
    manage.mockClear();
  });

  it('load returns the persisted geometry', () => {
    const persister = new ElectronWindowStatePersister({ file: 'x.json', defaultWidth: 800, defaultHeight: 600 });
    expect(persister.load()).toEqual({ x: undefined, y: undefined, width: 800, height: 600 });
  });

  it('save snapshots bounds via saveState and never calls manage (domain handle has no .on)', () => {
    const persister = new ElectronWindowStatePersister({ file: 'x.json', defaultWidth: 800, defaultHeight: 600 });

    persister.save(fakeWindow);

    expect(manage).not.toHaveBeenCalled();
    expect(saveState).toHaveBeenCalledWith(fakeWindow);
  });
});
