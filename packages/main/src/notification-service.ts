import { EAgentStatus } from '@gpu-monitor/shared';
import type { IAgent, IGpu, INotificationCooldowns, ITemperatureThresholds, DEFAULT_SETTINGS } from '@gpu-monitor/shared';
import { Notification } from 'electron';
import type { z } from 'zod';

import logger from './logger';
import type { settingsSchema } from './settings';

export type Settings = z.infer<typeof settingsSchema>;

export type FetchResult = 'pending' | 'ok' | 'fetch-failed' | 'health-failed' | 'error';

export interface AgentData {
  agents: IAgent[];
  gpus: Map<string, IGpu[]>;
  lastUpdate: Map<string, number>;
  lastFetchTimestamp: Map<string, number>;
  statusChangedAt: Map<string, number>;
  fetchResult: Map<string, FetchResult>;
}

type NotificationType = 'temp:critical' | 'temp:warn' | 'temp:recover' | 'agent:offline' | 'agent:online' | 'all:recovered';

const TYPE_TO_COOLDOWN_KEY: Record<NotificationType, keyof INotificationCooldowns> = {
  'temp:critical': 'tempCritical',
  'temp:warn': 'tempWarn',
  'temp:recover': 'tempRecover',
  'agent:offline': 'agentOffline',
  'agent:online': 'agentOnline',
  'all:recovered': 'allRecovered',
};

/**
 * Evaluates GPU temperatures and agent status against configured thresholds,
 * then fires native OS notifications with per-trigger cooldowns.
 */
export class NotificationService {
  private lastStates = new Map<string, 'normal' | 'warning' | 'critical'>();
  private allRecovered = new Map<string, boolean>();
  private cooldowns = new Map<string, number>();

  /**
   * Evaluate thresholds for all GPUs across all agents and dispatch notifications.
   */
  evaluateAndNotify(data: AgentData, settings: typeof DEFAULT_SETTINGS): void {
    if (!settings.notifications.enabled) {
      return;
    }

    const { agents, gpus, fetchResult } = data;
    const hadWarning = new Set<string>();

    for (const agent of agents) {
      const gpuList = gpus.get(agent.id);
      if (!gpuList || gpuList.length === 0) {
        continue;
      }
      this.processAgent(agent, gpuList, fetchResult, hadWarning, settings);
    }

    this.resetRecoveredFlags(hadWarning);
  }

  /** Process notifications for a single agent: metrics, transitions, recovery. */
  private processAgent(
    agent: IAgent,
    gpuList: IGpu[],
    fetchResult: Map<string, FetchResult>,
    hadWarning: Set<string>,
    settings: typeof DEFAULT_SETTINGS,
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

    this.dispatchAgentTransition(agentId, agentName, agent.status ?? EAgentStatus.Pending, fetchResult.get(agentId) === 'ok', cooldowns);
    this.lastStates.set(agentId, maxStatus);
    this.dispatchAllRecovered(agentId, agentName, metrics, hadWarning, cooldowns);
  }

  /** Dispatch a temp notification for one metric and update max status. */
  private dispatchMetric(
    metric: { metric: string, temp: number, warn: number, critical: number },
    status: 'normal' | 'warning' | 'danger',
    prev: 'normal' | 'warning' | 'critical',
    agentId: string,
    agentName: string,
    maxStatus: 'normal' | 'warning' | 'critical',
    hadWarning: Set<string>,
    cooldowns: INotificationCooldowns,
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

  /** Handle critical temperature: fire notification and return 'critical'. */
  private handleCritical(
    metric: { metric: string, temp: number },
    agentId: string,
    agentName: string,
    cooldowns: INotificationCooldowns,
    hadWarning: Set<string>,
  ): 'critical' {
    hadWarning.add(agentId);
    this.fireNotification('temp:critical', agentId, metric.metric, agentName, `${String(metric.temp)}°C`, 'critical.png', cooldowns);

    return 'critical';
  }

  /** Handle warning temperature: update max status and fire notification. */
  private handleWarning(
    metric: { metric: string, temp: number },
    agentId: string,
    agentName: string,
    maxStatus: 'normal' | 'warning' | 'critical',
    cooldowns: INotificationCooldowns,
    hadWarning: Set<string>,
  ): 'normal' | 'warning' | 'critical' {
    if (maxStatus !== 'critical') {
      maxStatus = 'warning';
    }
    hadWarning.add(agentId);
    this.fireNotification('temp:warn', agentId, metric.metric, agentName, `${String(metric.temp)}°C`, 'warning.png', cooldowns);

    return maxStatus;
  }

  /** Handle recovery: fire notification if temp dropped below threshold. */
  private handleRecovery(
    metric: { metric: string, temp: number, warn: number, critical: number },
    _status: 'normal',
    prev: 'normal' | 'warning' | 'critical',
    agentId: string,
    agentName: string,
    cooldowns: INotificationCooldowns,
  ): void {
    if (prev === 'normal') {
      return;
    }
    const recovered = prev === 'critical' ? metric.temp < metric.critical : metric.temp < metric.warn;
    if (recovered) {
      this.fireNotification('temp:recover', agentId, metric.metric, agentName, `${String(metric.temp)}°C`, 'normal.png', cooldowns);
    }
  }

  /** Dispatch online/offline agent transition notification. */
  private dispatchAgentTransition(
    agentId: string,
    agentName: string,
    agentStatus: EAgentStatus,
    fetchOk: boolean,
    cooldowns: INotificationCooldowns,
  ): void {
    if (fetchOk && agentStatus !== EAgentStatus.Online) {
      this.fireNotification('agent:online', agentId, '', agentName, '', 'normal.png', cooldowns);
    } else if (!fetchOk && agentStatus === EAgentStatus.Offline) {
      this.fireNotification('agent:offline', agentId, '', agentName, '', 'critical.png', cooldowns);
    }
  }

  /** Dispatch "all GPUs recovered" notification when every metric returns to normal. */
  private dispatchAllRecovered(
    agentId: string,
    agentName: string,
    metrics: Array<{ status: 'normal' | 'warning' | 'danger' }>,
    hadWarning: Set<string>,
    cooldowns: INotificationCooldowns,
  ): void {
    const allNormal = metrics.every((m) => m.status === 'normal');
    if (hadWarning.size > 0 && allNormal && !this.allRecovered.get(agentId)) {
      this.allRecovered.set(agentId, true);
      this.fireNotification('all:recovered', agentId, '', agentName, '', 'normal.png', cooldowns);
    }
  }

  /** Clear allRecovered flags for agents that went back to warning. */
  private resetRecoveredFlags(hadWarning: Set<string>): void {
    for (const agentId of hadWarning) {
      if (this.allRecovered.get(agentId)) {
        this.allRecovered.set(agentId, false);
      }
    }
  }

  /** Determine status from temperature vs thresholds. */
  private evaluateMetric(temp: number, warn: number, critical: number): 'normal' | 'warning' | 'danger' {
    if (temp >= critical) {
      return 'danger';
    }
    if (temp >= warn) {
      return 'warning';
    }

    return 'normal';
  }

  /** Gather temp metrics from a GPU list with their thresholds. */
  private gatherMetrics(gpuList: IGpu[], thresholds: ITemperatureThresholds) {
    const metrics: Array<{
      metric: string,
      temp: number,
      warn: number,
      critical: number,
      status: 'normal' | 'warning' | 'danger',
    }> = [];

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

  /** Check cooldown and fire a notification if eligible. */
  private fireNotification(
    type: NotificationType,
    agentId: string,
    metric: string,
    agentName: string,
    value: string,
    icon: string,
    cooldowns: INotificationCooldowns,
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

    const notif = new Notification({ title, body, icon: iconPath, silent: false });
    notif.show();

    logger.info({ type, agentId, metric, value }, `Notification fired: ${title}`);
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
