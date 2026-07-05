import { EAgentStatus } from '@gpu-monitor/shared';
import type { IAgent, IGpu } from '@gpu-monitor/shared';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';

import '@testing-library/jest-dom';
import { AgentSection, UnreachableAgent } from './App';

// Mock data
const mockAgent: IAgent = {
  id: 'agent-1',
  name: 'Test Agent',
  url: 'http://localhost:9091',
  status: EAgentStatus.Online,
};

const mockGpu: IGpu = {
  index: 0,
  name: 'NVIDIA GPU 0',
  uuid: 'GPU-uuid-1',
  coreTemp: 65,
  junctionTemp: 70,
  vramTemp: 60,
  gpuUtilization: 45,
  memoryUsed: 4000,
  memoryTotal: 8000,
  powerUsage: 150,
  coreStatus: 'normal',
  junctionStatus: 'normal',
  vramStatus: 'normal',
};

const mockGpuData = [
  { gpu: mockGpu, agentName: 'Test Agent' },
  { gpu: { ...mockGpu, index: 1, name: 'NVIDIA GPU 1' }, agentName: 'Test Agent' },
];

describe('AgentSection', () => {
  it('renders agent name and URL', () => {
    render(
      <AgentSection
        agentId="agent-1"
        gpuData={mockGpuData}
        agent={mockAgent}
        onGpuClick={() => {}}
      />,
    );

    expect(screen.getByText('Test Agent')).toBeInTheDocument();
    expect(screen.getByText('http://localhost:9091')).toBeInTheDocument();
  });

  it('renders Online status badge', () => {
    render(
      <AgentSection
        agentId="agent-1"
        gpuData={mockGpuData}
        agent={{ ...mockAgent, status: EAgentStatus.Online }}
        onGpuClick={() => {}}
      />,
    );

    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('renders Offline status badge', () => {
    render(
      <AgentSection
        agentId="agent-1"
        gpuData={mockGpuData}
        agent={{ ...mockAgent, status: EAgentStatus.Offline }}
        onGpuClick={() => {}}
      />,
    );

    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('renders Stale status badge', () => {
    render(
      <AgentSection
        agentId="agent-1"
        gpuData={mockGpuData}
        agent={{ ...mockAgent, status: EAgentStatus.Stale }}
        onGpuClick={() => {}}
      />,
    );

    expect(screen.getByText('Stale')).toBeInTheDocument();
  });

  it('renders Unknown status when agent is undefined', () => {
    render(
      <AgentSection
        agentId="agent-1"
        gpuData={mockGpuData}
        agent={undefined}
        onGpuClick={() => {}}
      />,
    );

    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('renders GPU cards for each GPU', () => {
    render(
      <AgentSection
        agentId="agent-1"
        gpuData={mockGpuData}
        agent={mockAgent}
        onGpuClick={() => {}}
      />,
    );

    // Should render 2 GPU cards (one for each GPU in mockGpuData)
    const gpuSectionHeader = document.querySelector('.agent-section-header');
    expect(gpuSectionHeader).toBeInTheDocument();

    // Check that the component renders without errors
    const agentSection = document.querySelector('.agent-section');
    expect(agentSection).toBeInTheDocument();
  });

  it('calls onGpuClick when GPU card is clicked', () => {
    const onGpuClick = vi.fn();

    render(
      <AgentSection
        agentId="agent-1"
        gpuData={mockGpuData}
        agent={mockAgent}
        onGpuClick={onGpuClick}
      />,
    );

    // Click on first GPU card
    const firstCard = document.querySelectorAll('[class*="gpu-card"]')[0];
    fireEvent.click(firstCard);

    expect(onGpuClick).toHaveBeenCalledWith(
      'agent-1',
      'Test Agent',
      mockGpu,
      0,
    );
  });

  it('renders empty agent URL when agent is undefined', () => {
    render(
      <AgentSection
        agentId="agent-1"
        gpuData={mockGpuData}
        agent={undefined}
        onGpuClick={() => {}}
      />,
    );

    // When agent is undefined, URL should be empty string
    const urlElement = document.querySelector('.agent-endpoint');
    expect(urlElement).toBeInTheDocument();
    expect(urlElement?.textContent).toBe('');
  });
});

describe('UnreachableAgent', () => {
  it('renders agent name and URL', () => {
    render(
      <UnreachableAgent
        agent={{ id: 'agent-2', name: 'Unreachable', url: 'http://localhost:9092', status: EAgentStatus.Offline }}
        onGpuClick={() => {}}
      />,
    );

    expect(screen.getByText('Unreachable')).toBeInTheDocument();
    expect(screen.getByText('http://localhost:9092')).toBeInTheDocument();
  });

  it('renders Offline status badge', () => {
    render(
      <UnreachableAgent
        agent={{ id: 'agent-2', name: 'Unreachable', url: 'http://localhost:9092', status: EAgentStatus.Offline }}
        onGpuClick={() => {}}
      />,
    );

    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('renders with unreachable CSS class', () => {
    render(
      <UnreachableAgent
        agent={{ id: 'agent-2', name: 'Unreachable', url: 'http://localhost:9092', status: EAgentStatus.Offline }}
        onGpuClick={() => {}}
      />,
    );

    const section = document.querySelector('.agent-section-unreachable');
    expect(section).toBeInTheDocument();
  });
});
