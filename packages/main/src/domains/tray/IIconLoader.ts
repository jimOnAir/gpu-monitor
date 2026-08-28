export interface IIconLoader {
  loadIcon: (name: string) => unknown;
  loadBuildIcon: (resize?: boolean) => unknown;
}
