import { EAgentStatus } from '../enums/EAgentStatus';

export interface IAgent {
  id: string;
  name: string;
  url: string;
  status: EAgentStatus;
  lastError?: string;
  lastUpdate?: number;
}
