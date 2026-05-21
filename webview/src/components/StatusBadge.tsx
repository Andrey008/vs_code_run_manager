import React from 'react';
import type { ServiceStatus } from '../types';

const COLORS: Record<ServiceStatus, string> = {
  stopped: '#6c7280',
  starting: '#f59e0b',
  running: '#3b82f6',
  ready: '#22c55e',
  crashed: '#ef4444',
};

const LABELS: Record<ServiceStatus, string> = {
  stopped: '⬤ stopped',
  starting: '⬤ starting',
  running: '⬤ running',
  ready: '⬤ ready',
  crashed: '⬤ crashed',
};

interface Props {
  status: ServiceStatus;
}

export function StatusBadge({ status }: Props) {
  return (
    <span style={{ color: COLORS[status], fontSize: '12px', whiteSpace: 'nowrap' }}>
      {LABELS[status]}
    </span>
  );
}
