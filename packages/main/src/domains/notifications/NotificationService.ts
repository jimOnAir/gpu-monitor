import { EAgentStatus, evaluateStatus, type IAgent, type IGpu, type INotificationCooldowns, type ISettings, type ITemperatureThresholds, type MetricStatus } from '@gpu-monitor/shared';
import type { AgentData, FetchResult } from '@gpu-monitor/shared';

import type { Logger } from '../../logger';

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

interface TemperatureMetric {
  metric: string;
  temp: number;
  warn: number;
  critical: number;
  status: MetricStatus;
}

/**
 * Evaluates GPU temperature and agent status against configured thresholds,
 * and dispatches native OS notifications with per-trigger cooldowns.
 *
 * State:
 * - lastStates: per-metric previous status (key: `${agentId}:${metric}`)
 * - warnedAgents: agents that had a warning/critical in a previous cycle
 * - allRecovered: agents that already fired the all-recovered notification
 * - cooldowns: last fire timestamp per trigger key
 */
export class NotificationService implements INotificationService {
  private lastStates = new Map<string, MetricStatus>();
  private warnedAgents = new Map<string, boolean>();
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

    for (const agent of agents) {
      const gpuList = gpus.get(agent.id);
      if (!gpuList || gpuList.length === 0) {
        this.processAgentTransition(agent, fetchResult, prevAgentStatus, settings.notifications.cooldowns);
        continue;
      }
      this.processAgent(agent, gpuList, fetchResult, prevAgentStatus, settings);
    }

    this.pruneCooldowns(settings.notifications.cooldowns);
  }

  private processAgent(
    agent: IAgent, gpuList: IGpu[], fetchResult: Map<string, FetchResult>,
    prevAgentStatus: Map<string, EAgentStatus>, settings: ISettings,
  ): void {
    const agentId = agent.id;
    const metrics = this.gatherMetrics(gpuList, settings.thresholds);
    const cooldowns = settings.notifications.cooldowns;
    let agentWarned = false;

    for (const metric of metrics) {
      const status = evaluateStatus(metric.temp, metric.warn, metric.critical);
      const prev = this.lastStates.get(`${agentId}:${metric.metric}`) ?? 'normal';
      if (status !== 'normal') {
        agentWarned = true;
      }
      this.dispatchMetric(metric, status, prev, agentId, agent.name, cooldowns);
      this.lastStates.set(`${agentId}:${metric.metric}`, status);
    }

    this.processAgentTransition(agent, fetchResult, prevAgentStatus, cooldowns);
    this.dispatchAllRecovered(agent, metrics, agentWarned, cooldowns);
  }

  private processAgentTransition(
    agent: IAgent, fetchResult: Map<string, FetchResult>,
    prevAgentStatus: Map<string, EAgentStatus>, cooldowns: INotificationCooldowns,
  ): void {
    const agentStatus = agent.status ?? EAgentStatus.Pending;
    const prevStatus = prevAgentStatus.get(agent.id);
    const fetchOk = fetchResult.get(agent.id) === 'ok';

    if (fetchOk && agentStatus === EAgentStatus.Online && prevStatus !== EAgentStatus.Online) {
      this.fireNotification('agent:online', agent.id, '', agent.name, '', 'normal.png', cooldowns);
    } else if (!fetchOk && agentStatus === EAgentStatus.Offline && prevStatus !== EAgentStatus.Offline) {
      this.fireNotification('agent:offline', agent.id, '', agent.name, '', 'critical.png', cooldowns);
    }
  }

  private dispatchMetric(
    metric: TemperatureMetric,
    status: MetricStatus,
    prev: MetricStatus,
    agentId: string, agentName: string,
    cooldowns: INotificationCooldowns,
  ): void {
    if (status === 'danger') {
      this.fireNotification('temp:critical', agentId, metric.metric, agentName, `${String(metric.temp)}°C`, 'critical.png', cooldowns);
    } else if (status === 'warning') {
      this.fireNotification('temp:warn', agentId, metric.metric, agentName, `${String(metric.temp)}°C`, 'warning.png', cooldowns);
    } else if (prev !== 'normal') {
      const recovered = prev === 'danger' ? metric.temp < metric.critical : metric.temp < metric.warn;
      if (recovered) {
        this.fireNotification('temp:recover', agentId, metric.metric, agentName, `${String(metric.temp)}°C`, 'normal.png', cooldowns);
      }
    }
  }

  private dispatchAllRecovered(
    agent: IAgent,
    metrics: TemperatureMetric[],
    agentWarned: boolean,
    cooldowns: INotificationCooldowns,
  ): void {
    const agentId = agent.id;
    const allNormal = metrics.every((m) => m.status === 'normal');
    const wasWarned = this.warnedAgents.get(agentId) ?? false;

    if (!agentWarned && allNormal && wasWarned && !this.allRecovered.get(agentId)) {
      this.allRecovered.set(agentId, true);
      this.fireNotification('all:recovered', agentId, '', agent.name, '', 'normal.png', cooldowns);
    }

    this.warnedAgents.set(agentId, agentWarned);
  }

  private gatherMetrics(gpuList: IGpu[], thresholds: ITemperatureThresholds): TemperatureMetric[] {
    const keyMap: Array<{ key: keyof ITemperatureThresholds, tempKey: keyof IGpu }> = [
      { key: 'core', tempKey: 'coreTemp' },
      { key: 'junction', tempKey: 'junctionTemp' },
      { key: 'vram', tempKey: 'vramTemp' },
    ];

    const metrics: TemperatureMetric[] = [];

    for (const gpu of gpuList) {
      for (const { key, tempKey } of keyMap) {
        metrics.push({
          metric: key,
          temp: gpu[tempKey] as number,
          warn: thresholds[key].warn,
          critical: thresholds[key].critical,
          status: evaluateStatus(gpu[tempKey] as number, thresholds[key].warn, thresholds[key].critical),
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
    const body = this.buildNotificationBody(type, agentName, metric);

    this.notificationDispatcher.show({ title, body, icon, silent: false });
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

  private buildNotificationBody(type: NotificationType, agentName: string, metric: string): string {
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

  private pruneCooldowns(cooldowns: INotificationCooldowns): void {
    const maxCooldown = Math.max(
      cooldowns.tempCritical,
      cooldowns.tempWarn,
      cooldowns.tempRecover,
      cooldowns.agentOffline,
      cooldowns.agentOnline,
      cooldowns.allRecovered,
    );
    const now = Date.now();
    for (const [key, timestamp] of this.cooldowns) {
      if (now - timestamp > maxCooldown) {
        this.cooldowns.delete(key);
      }
    }
  }
}
