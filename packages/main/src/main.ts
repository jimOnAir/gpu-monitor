import { app } from 'electron';

import { AppBootstrap } from './infrastructure/bootstrap/AppBootstrap';
import { ElectronAdapter } from './infrastructure/electron/ElectronAdapter';
import logger from './logger';

app.setName('gpu-monitor');

app.whenReady().then(() => {
  const bootstrap = new AppBootstrap(new ElectronAdapter(logger, app));
  bootstrap.initialize();
});
