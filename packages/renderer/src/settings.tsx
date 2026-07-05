import React from 'react';
import { createRoot } from 'react-dom/client';

import { SettingsApp } from './SettingsApp';
import './styles/main.css';

console.log('Settings entry point loaded');

const container = document.getElementById('root');
if (container) {
  console.log('Root container found');
  const root = createRoot(container);
  try {
    console.log('Rendering SettingsApp');
    root.render(<SettingsApp />);
    console.log('SettingsApp rendered successfully');
  } catch (err) {
    console.error('Failed to render SettingsApp:', err);
    container.innerHTML = `<div style="padding: 20px; color: red;">Error: ${(err as Error).message}</div>`;
  }
} else {
  console.error('Root container not found');
}
