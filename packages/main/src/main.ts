import { app } from 'electron';

import { AppBootstrap } from './infrastructure/bootstrap/AppBootstrap';
import { ElectronAdapter } from './infrastructure/electron/ElectronAdapter';
import { ElectronAppLifecycle } from './infrastructure/electron/ElectronAppLifecycle';
import { ElectronAutoUpdater } from './infrastructure/electron/ElectronAutoUpdater';
import { ElectronCrashRecoveryService } from './infrastructure/electron/ElectronCrashRecoveryService';
import { ElectronDialogAdapter } from './infrastructure/electron/ElectronDialogAdapter';
import { ElectronExternalOpener } from './infrastructure/electron/ElectronExternalOpener';
import { ElectronIconLoader } from './infrastructure/electron/ElectronIconLoader';
import { ElectronMenuFactory } from './infrastructure/electron/ElectronMenuFactory';
import { ElectronNotificationDispatcher } from './infrastructure/electron/ElectronNotificationDispatcher';
import { ElectronThemeListener } from './infrastructure/electron/ElectronThemeListener';
import { ElectronTrayFactory } from './infrastructure/electron/ElectronTrayFactory';
import { ElectronWindowFactory } from './infrastructure/electron/ElectronWindowFactory';
import { NodeFileStorage } from './infrastructure/electron/NodeFileStorage';
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
    new ElectronCrashRecoveryService(app, new NodeFileStorage()),
    new NodeFileStorage(),
  );
  const bootstrap = new AppBootstrap(
    logger,
    adapter,
    new ElectronAppLifecycle(),
    new ElectronAutoUpdater(),
    new ElectronDialogAdapter(),
  );
  void bootstrap.initialize();
});
