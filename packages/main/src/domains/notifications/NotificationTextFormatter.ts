import type { INotificationCooldowns } from '@gpu-monitor/shared';

export type NotificationType = 'temp:critical' | 'temp:warn' | 'temp:recover' | 'agent:offline' | 'agent:online' | 'all:recovered';

/**
 * Maps notification types to their corresponding cooldown configuration keys.
 */
export const TYPE_TO_COOLDOWN_KEY: Record<NotificationType, keyof INotificationCooldowns> = {
  'temp:critical': 'tempCritical',
  'temp:warn': 'tempWarn',
  'temp:recover': 'tempRecover',
  'agent:offline': 'agentOffline',
  'agent:online': 'agentOnline',
  'all:recovered': 'allRecovered',
};

/**
 * Builds notification titles and bodies from notification type and context.
 * Pure text formatting — no side effects, no dispatch, no cooldown logic.
 */
export class NotificationTextFormatter {
  buildNotificationTitle(type: NotificationType, agentName: string, metric: string): string {
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

  buildNotificationBody(type: NotificationType, agentName: string, metric: string): string {
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
