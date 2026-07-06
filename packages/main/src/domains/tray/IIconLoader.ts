import type { NativeImage } from 'electron';

export interface IIconLoader {
  loadIcon: (name: string) => NativeImage;
  loadBuildIcon: () => NativeImage;
}
