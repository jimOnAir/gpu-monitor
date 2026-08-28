import type { IWindowHandle } from './IWindowHandle';

export interface IWindowFactory {
  create: (opts: {
    x?: number,
    y?: number,
    width?: number,
    height?: number,
    minWidth?: number,
    minHeight?: number,
    parent?: IWindowHandle | null,
    backgroundColor?: string,
    icon?: unknown,
    hasShadow?: boolean,
    roundedCorners?: boolean,
    titleBarStyle?: 'hidden' | 'default',
    show?: boolean,
    loadFile: string,
    onReadyToShow: () => void,
    onFocus: () => void,
    onBlur: () => void,
    onClose: (event: { preventDefault: () => void }) => void,
    onWillNavigate: (event: { preventDefault: () => void }, url: string) => void,
    onWindowOpen: (url: string) => 'allow' | 'deny',
  }) => IWindowHandle;
}
