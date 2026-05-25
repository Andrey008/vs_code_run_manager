import { render, fireEvent } from '@testing-library/react';
import { ActionButton } from './ActionButton';
import type { ServiceStatus } from '../types';

interface Case {
  status: ServiceStatus;
  runTitle: string;
  debugTitle: string;
  intent: 'start' | 'stop';
}

const CASES: Case[] = [
  { status: 'stopped',  runTitle: 'stopped — click to start',  debugTitle: 'stopped — click to start (debug)',  intent: 'start' },
  { status: 'starting', runTitle: 'starting — click to stop',  debugTitle: 'starting — click to stop',           intent: 'stop'  },
  { status: 'running',  runTitle: 'running — click to stop',   debugTitle: 'running — click to stop',            intent: 'stop'  },
  { status: 'ready',    runTitle: 'ready — click to stop',     debugTitle: 'ready — click to stop',              intent: 'stop'  },
  { status: 'crashed',  runTitle: 'crashed — click to start',  debugTitle: 'crashed — click to start (debug)',   intent: 'start' },
];

describe('ActionButton', () => {
  for (const { status, runTitle, debugTitle, intent } of CASES) {
    it(`renders and dispatches for status='${status}' kind='run'`, () => {
      const onAction = jest.fn();
      const { container } = render(<ActionButton status={status} kind="run" onAction={onAction} />);
      const btn = container.querySelector('button');
      expect(btn).not.toBeNull();
      expect(btn!.getAttribute('title')).toBe(runTitle);
      fireEvent.click(btn!);
      expect(onAction).toHaveBeenCalledWith(intent, 'run');
    });

    it(`renders and dispatches for status='${status}' kind='debug'`, () => {
      const onAction = jest.fn();
      const { container } = render(<ActionButton status={status} kind="debug" onAction={onAction} />);
      const btn = container.querySelector('button');
      expect(btn).not.toBeNull();
      expect(btn!.getAttribute('title')).toBe(debugTitle);
      fireEvent.click(btn!);
      expect(onAction).toHaveBeenCalledWith(intent, 'debug');
    });
  }
});
