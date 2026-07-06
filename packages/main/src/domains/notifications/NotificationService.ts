import { EAgentStatus, type IAgent, type IGpu, type INotificationCooldowns, type ISettings } from '@gpu-monitor/shared';
import type { AgentData, FetchResult } from '@gpu-monitor/shared';

import type { Logger } from '../../logger';

import type { INotificationDispatcher } from './INotificationDispatcher';
import type { INotificationService } from './INotificationService';
import type { NotificationTextFormatter } from './NotificationTextFormatter';
import { type NotificationType, TYPE_TO_COOLDOWN_KEY } from './NotificationTextFormatter';
import type { TemperatureEvaluator } from './TemperatureEvaluator';

/**
 * Evaluates GPU temperature and agent status against configured thresholds,
 * and dispatches native OS notifications with per-trigger cooldowns.
 */
export class NotificationService implements INotificationService {
  private lastStates = new Map<string, 'normal' | 'warning' | 'critical'>();
  private allRecovered = new Map<string, boolean>();
  private cooldowns = new Map<string, number>();

  constructor(
    private readonly logger: Logger,
    private readonly notificationDispatcher: INotificationDispatcher,
    private readonly temperatureEvaluator: TemperatureEvaluator,
    private readonly textFormatter: NotificationTextFormatter,
  ) {}

  evaluateAndNotify(data: AgentData, settings: ISettings): void {
    if (!settings.notifications.enabled) {
      return;
    }

    const { agents, gpus, fetchResult, prevAgentStatus } = data;
    const hadWarning = new Set<string>();

    for (const agent of agents) {
      const gpuList = gpus.get(agent.id);
      if (!gpuList || gpuList.length === 0) {
        continue;
      }
      this.processAgent(agent, gpuList, fetchResult, prevAgentStatus.get(agent.id), hadWarning, settings);
    }

    this.resetRecoveredFlags(hadWarning);
  }

  private processAgent(
    agent: IAgent, gpuList: IGpu[], fetchResult: Map<string, FetchResult>,
    prevAgentStatus: EAgentStatus | undefined,
    hadWarning: Set<string>, settings: ISettings,
  ): void {
    const agentId = agent.id;
    const agentName = agent.name;
    const prev = this.lastStates.get(agentId) ?? 'normal';
    const metrics = this.temperatureEvaluator.gatherMetrics(gpuList, settings.thresholds);
    const cooldowns = settings.notifications.cooldowns;
    let maxStatus: 'normal' | 'warning' | 'critical' = 'normal';

    for (const metric of metrics) {
      const status = this.temperatureEvaluator.evaluateMetric(metric.temp, metric.warn, metric.critical);
      maxStatus = this.dispatchMetric(metric, status, prev, agentId, agentName, maxStatus, hadWarning, cooldowns);
    }

    this.dispatchAgentTransition(agentId, agentName, agent.status ?? EAgentStatus.Pending, fetchResult.get(agentId) === 'ok', prevAgentStatus, cooldowns);
    this.lastStates.set(agentId, maxStatus);
    this.dispatchAllRecovered(agentId, agentName, metrics, hadWarning, cooldowns);
  }

  private dispatchMetric(
    metric: { metric: string, temp: number, warn: number, critical: number },
    status: 'normal' | 'warning' | 'danger',
    prev: 'normal' | 'warning' | 'critical',
    agentId: string, agentName: string, maxStatus: 'normal' | 'warning' | 'critical',
    hadWarning: Set<string>, cooldowns: INotificationCooldowns,
  ): 'normal' | 'warning' | 'critical' {
    if (status === 'danger') {
      return this.handleCritical(metric, agentId, agentName, cooldowns, hadWarning);
    }
    if (status === 'warning') {
      return this.handleWarning(metric, agentId, agentName, maxStatus, cooldowns, hadWarning);
    }
    this.handleRecovery(metric, status, prev, agentId, agentName, cooldowns);

    return maxStatus;
  }

  private handleCritical(
    metric: { metric: string, temp: number }, agentId: string, agentName: string,
    cooldowns: INotificationCooldowns, hadWarning: Set<string>,
  ): 'critical' {
    hadWarning.add(agentId);
    this.fireNotification('temp:critical', agentId, metric.metric, agentName, `${String(metric.temp)}°C`, 'critical.png', cooldowns);

    return 'critical';
  }

  private handleWarning(
    metric: { metric: string, temp: number }, agentId: string, agentName: string,
    maxStatus: 'normal' | 'warning' | 'critical', cooldowns: INotificationCooldowns, hadWarning: Set<string>,
  ): 'normal' | 'warning' | 'critical' {
    if (maxStatus !== 'critical') {
      maxStatus = 'warning';
    }
    hadWarning.add(agentId);
    this.fireNotification('temp:warn', agentId, metric.metric, agentName, `${String(metric.temp)}°C`, 'warning.png', cooldowns);

    return maxStatus;
  }

  private handleRecovery(
    metric: { metric: string, temp: number, warn: number, critical: number },
    _status: 'normal', prev: 'normal' | 'warning' | 'critical',
    agentId: string, agentName: string, cooldowns: INotificationCooldowns,
  ): void {
    if (prev === 'normal') {
      return;
    }
    const recovered = prev === 'critical' ? metric.temp < metric.critical : metric.temp < metric.warn;
    if (recovered) {
      this.fireNotification('temp:recover', agentId, metric.metric, agentName, `${String(metric.temp)}°C`, 'normal.png', cooldowns);
    }
  }

  private dispatchAgentTransition(
    agentId: string, agentName: string, agentStatus: EAgentStatus, fetchOk: boolean,
    prevStatus: EAgentStatus | undefined, cooldowns: INotificationCooldowns,
  ): void {
    if (fetchOk && agentStatus === EAgentStatus.Online && prevStatus !== EAgentStatus.Online) {
      this.fireNotification('agent:online', agentId, '', agentName, '', 'normal.png', cooldowns);
    } else if (!fetchOk && agentStatus === EAgentStatus.Offline) {
      this.fireNotification('agent:offline', agentId, '', agentName, '', 'critical.png', cooldowns);
    }
  }

  private dispatchAllRecovered(
    agentId: string, agentName: string,
    metrics: Array<{ status: 'normal' | 'warning' | 'danger' }>,
    hadWarning: Set<string>, cooldowns: INotificationCooldowns,
  ): void {
    const allNormal = metrics.every((m) => m.status === 'normal');
    if (hadWarning.size > 0 && allNormal && !this.allRecovered.get(agentId)) {
      this.allRecovered.set(agentId, true);
      this.fireNotification('all:recovered', agentId, '', agentName, '', 'normal.png', cooldowns);
    }
  }

  private resetRecoveredFlags(hadWarning: Set<string>): void {
    for (const agentId of hadWarning) {
      if (this.allRecovered.get(agentId)) {
        this.allRecovered.set(agentId, false);
      }
    }
  }

  private fireNotification(
    type: NotificationType, agentId: string, metric: string, agentName: string,
    value: string, icon: string, cooldowns: INotificationCooldowns,
  ): void {
    const cooldownKey = metric ? `${type}:${agentId}:${metric}` : `${type}:${agentId}`;
    const now = Date.now();
    const lastFire = this.cooldowns.get(cooldownKey) || 0;
    const cooldown = cooldowns[TYPE_TO_COOLDOWN_KEY[type]];
    if (now - lastFire < cooldown) {
      return;
    }
    this.cooldowns.set(cooldownKey, now);

    const title = this.textFormatter.buildNotificationTitle(type, agentName, metric);
    const body = this.textFormatter.buildNotificationBody(type, agentName, metric);

    this.notificationDispatcher.show({ title, body, icon, silent: false });
    this.logger.info({ type, agentId, metric, value }, `Notification fired: ${title}`);
  }
}
