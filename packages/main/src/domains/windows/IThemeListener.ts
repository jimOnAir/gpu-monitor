export type ThemeColor = string;

export interface IThemeListener {
  subscribe: (callback: (color: ThemeColor) => void) => void;
  getCurrentColor: () => ThemeColor;
  start: () => void;
}
