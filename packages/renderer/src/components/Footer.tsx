import React from 'react';

interface FooterProps {
  refreshInterval: number;
  lastUpdate: number;
}

export const Footer: React.FC<FooterProps> = ({
  refreshInterval,
  lastUpdate,
}) => {
  const formatTime = (ts: number): string => {
    if (!ts) {
      return '--:--:--';
    }
    const d = new Date(ts);

    return d.toLocaleTimeString();
  };

  return (
    <div className="footer">
      <div className="footer-items">
        <div className="footer-item">
          Last update: {formatTime(lastUpdate)}
        </div>
        <div className="footer-divider">|</div>
        <div className="footer-item">
          Refresh: {(refreshInterval / 1000).toFixed(0)}s
        </div>
      </div>
    </div>
  );
};
