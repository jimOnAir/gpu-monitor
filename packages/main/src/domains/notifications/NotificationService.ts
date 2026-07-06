import { EAgentStatus, type IAgent, type IGpu, type INotificationCooldowns, type ISettings, type ITemperatureThresholds } from '@gpu-monitor/shared';

import type { Logger } from '../../logger';
import type { AgentData, FetchResult } from '../polling/AgentData';

import type { INotificationDispatcher } from './INotificationDispatcher';
import type { INotificationService } from './INotificationService';

type NotificationType = 'temp:critical' | 'temp:warn' | 'temp:recover' | 'agent:offline' | 'agent:online' | 'all:recovered';

const TYPE_TO_COOLDOWN_KEY: Record<NotificationType, keyof INotificationCooldowns> = {
  'temp:critical': 'tempCritical',
  'temp:warn': 'tempWarn',
  'temp:recover': 'tempRecover',
  'agent:offline': 'agentOffline',
  'agent:online': 'agentOnline',
  'all:recovered': 'allRecovered',
};

export class NotificationService implements INotificationService {
  private lastStates = new Map<string, 'normal' | 'warning' | 'critical'>();
  private allRecovered = new Map<string, boolean>();
  private cooldowns = new Map<string, number>();

  constructor(
    private readonly logger: Logger,
    private readonly notificationDispatcher: INotificationDispatcher,
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
    const metrics = this.gatherMetrics(gpuList, settings.thresholds);
    const cooldowns = settings.notifications.cooldowns;
    let maxStatus: 'normal' | 'warning' | 'critical' = 'normal';

    for (const metric of metrics) {
      const status = this.evaluateMetric(metric.temp, metric.warn, metric.critical);
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

  private evaluateMetric(temp: number, warn: number, critical: number): 'normal' | 'warning' | 'danger' {
    if (temp >= critical) {
      return 'danger';
    }
    if (temp >= warn) {
      return 'warning';
    }

    return 'normal';
  }

  private gatherMetrics(gpuList: IGpu[], thresholds: ITemperatureThresholds) {
    const metrics: Array<{ metric: string, temp: number, warn: number, critical: number, status: 'normal' | 'warning' | 'danger' }> = [];
    const keyMap: Array<{ key: keyof ITemperatureThresholds, tempKey: keyof IGpu, statusKey: keyof IGpu }> = [
      { key: 'core', tempKey: 'coreTemp', statusKey: 'coreStatus' },
      { key: 'junction', tempKey: 'junctionTemp', statusKey: 'junctionStatus' },
      { key: 'vram', tempKey: 'vramTemp', statusKey: 'vramStatus' },
    ];
    for (const gpu of gpuList) {
      for (const { key, tempKey, statusKey } of keyMap) {
        metrics.push({
          metric: key,
          temp: gpu[tempKey] as number,
          warn: thresholds[key].warn,
          critical: thresholds[key].critical,
          status: gpu[statusKey] as 'normal' | 'warning' | 'danger',
        });
      }
    }

    return metrics;
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

    const title = this.buildNotificationTitle(type, agentName, metric);
    const body = this.buildNotificationBody(type, agentName, metric, value);
    const iconPath = `../../assets/${icon}`;

    this.notificationDispatcher.show({ title, body, icon: iconPath, silent: false });
    this.logger.info({ type, agentId, metric, value }, `Notification fired: ${title}`);
  }

  private buildNotificationTitle(type: NotificationType, agentName: string, metric: string): string {
    const metricLabel = metric ? ` — ${metric.charAt(0).toUpperCase() + metric.slice(1)}` : '';
    const titles: Record<NotificationType, string> = {
      'temp:critical': `GPU Temperature Critical${metricLabel} — ${agentName}`,
      'temp:warn': `GPU Temperature Warning${metricLabel} — ${agentName}`,
      'temp:recover': `GPU Temperature Recovered${metricLabel} — ${agentName}`,
      'agent:offline': `Agent Offline — ${agentName}`,
      'agent:online': `Agent Online — ${agentName}`,
      'all:recovered': `All GPUs Recovered — ${agentName}`,
    };

    return titles[type];
  }

  private buildNotificationBody(type: NotificationType, agentName: string, metric: string, _value: string): string {
    const bodies: Record<NotificationType, string> = {
      'temp:critical': `${metric} temperature exceeded critical threshold on ${agentName}.`,
      'temp:warn': `${metric} temperature exceeded warning threshold on ${agentName}.`,
      'temp:recover': `${metric} temperature returned to normal on ${agentName}.`,
      'agent:offline': `Agent ${agentName} is not responding.`,
      'agent:online': `Agent ${agentName} is back online.`,
      'all:recovered': `All GPU temperatures on ${agentName} are within normal range.`,
    };

    return bodies[type];
  }
}
