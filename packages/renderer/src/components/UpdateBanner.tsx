import type { UpdateAvailableInfo, UpdateDownloadedInfo } from '@gpu-monitor/shared';
import React, { useCallback, useEffect, useState } from 'react';

interface UpdateBannerProps {
  visible: boolean;
}

export const UpdateBanner: React.FC<UpdateBannerProps> = ({ visible }) => {
  const [updateInfo, setUpdateInfo] = useState<UpdateAvailableInfo | null>(null);
  const [updateDownloaded, setUpdateDownloaded] = useState<UpdateDownloadedInfo | null>(null);

  useEffect(() => {
    if (!visible || !window.electronAPI) {
      return;
    }
    const offAvailable = window.electronAPI.onUpdateAvailable((info) => {
      setUpdateInfo(info);
      setUpdateDownloaded(null);
    });
    const offDownloaded = window.electronAPI.onUpdateDownloaded((info) => {
      setUpdateDownloaded(info);
    });

    return () => {
      offAvailable();
      offDownloaded();
    };
  }, [visible]);

  const dismissUpdateDownloaded = useCallback(() => {
    setUpdateDownloaded(null);
  }, []);

  const dismissUpdateInfo = useCallback(() => {
    setUpdateInfo(null);
  }, []);

  if (updateDownloaded) {
    return (
      <div className="update-banner update-banner-ready">
        <span>Update {updateDownloaded.version} downloaded — restart to install</span>
        <button className="update-banner-dismiss" onClick={dismissUpdateDownloaded}>✕</button>
      </div>
    );
  }

  if (updateInfo) {
    return (
      <div className="update-banner">
        <span>Update {updateInfo.version} available — downloading…</span>
        <button className="update-banner-dismiss" onClick={dismissUpdateInfo}>✕</button>
      </div>
    );
  }

  return null;
};
