import { app } from 'electron';

import { AppBootstrap } from './infrastructure/bootstrap/AppBootstrap';
import { ElectronAdapter } from './infrastructure/electron/ElectronAdapter';
import { ElectronExternalOpener } from './infrastructure/electron/ElectronExternalOpener';
import { ElectronIconLoader } from './infrastructure/electron/ElectronIconLoader';
import { ElectronMenuFactory } from './infrastructure/electron/ElectronMenuFactory';
import { ElectronNotificationDispatcher } from './infrastructure/electron/ElectronNotificationDispatcher';
import { ElectronThemeListener } from './infrastructure/electron/ElectronThemeListener';
import { ElectronTrayFactory } from './infrastructure/electron/ElectronTrayFactory';
import { ElectronWindowFactory } from './infrastructure/electron/ElectronWindowFactory';
import { NodeHttpAdapter } from './infrastructure/electron/NodeHttpAdapter';
import logger from './logger';

app.setName('gpu-monitor');

app.whenReady().then(() => {
  const adapter = new ElectronAdapter(
    logger,
    app,
    new NodeHttpAdapter(logger),
    new ElectronNotificationDispatcher(),
    new ElectronTrayFactory(),
    new ElectronWindowFactory(),
    new ElectronIconLoader(logger),
    new ElectronThemeListener(),
    new ElectronExternalOpener(),
    new ElectronMenuFactory(),
  );
  const bootstrap = new AppBootstrap(logger, adapter);
  bootstrap.initialize();
});
