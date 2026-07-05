import { useEffect, useState } from 'react';

/**
 * Hook that tracks whether the Electron window has focus.
 * Used to dim the app when unfocused for a native feel.
 * Uses the contextBridge-exposed API — never imports ipcRenderer directly.
 */
export function useWindowFocus(): boolean {
  const [isFocused, setIsFocused] = useState(true);

  useEffect(() => {
    const onFocus = () => {
      setIsFocused(true);
    };
    const onBlur = () => {
      setIsFocused(false);
    };

    const unsubFocus = window.electronAPI?.onWindowFocus(onFocus);
    const unsubBlur = window.electronAPI?.onWindowBlur(onBlur);

    return () => {
      unsubFocus?.();
      unsubBlur?.();
    };
  }, []);

  return isFocused;
}
