import { render, fireEvent } from '@testing-library/react';
import { ServiceItem } from './ServiceItem';
import * as vscodeApi from '../vscodeApi';
import type { ServiceConfig, ServiceStatus, WebviewMessage } from '../types';

// The moduleNameMapper redirects '../vscodeApi' to a mock that adds capture
// helpers at runtime; cast to access them without altering the production type.
const { postedMessages, resetPostedMessages } = vscodeApi as unknown as {
  postedMessages: WebviewMessage[];
  resetPostedMessages: () => void;
};

const SERVICE: ServiceConfig = { id: 'api', name: 'API', type: 'shell' };

const noop = () => undefined;
const baseProps = {
  isSelected: false,
  onSelect: noop,
  showCheckbox: false,
  isChecked: false,
  onToggle: noop,
};

describe('ServiceItem — non-launch (US1)', () => {
  beforeEach(() => resetPostedMessages());

  it('renders a single action button + Restart (no StatusBadge)', () => {
    const { container } = render(<ServiceItem service={SERVICE} status="running" {...baseProps} />);
    expect(container.querySelectorAll('button').length).toBe(2);
    expect(container.textContent || '').not.toMatch(/⬤/);
  });

  it.each<ServiceStatus>(['stopped', 'starting', 'running', 'ready', 'crashed'])(
    'keeps Restart visible in status=%s',
    status => {
      const { container } = render(<ServiceItem service={SERVICE} status={status} {...baseProps} />);
      expect(container.querySelector('button[title="Restart"]')).not.toBeNull();
    },
  );

  it('clicking the action button at status=stopped posts start (no mode for non-launch)', () => {
    const { container } = render(<ServiceItem service={SERVICE} status="stopped" {...baseProps} />);
    fireEvent.click(container.querySelector('button[title^="stopped"]')!);
    expect(postedMessages).toEqual([{ type: 'start', id: 'api' }]);
  });

  it('clicking the action button at status=ready posts stop', () => {
    const { container } = render(<ServiceItem service={SERVICE} status="ready" {...baseProps} />);
    fireEvent.click(container.querySelector('button[title^="ready"]')!);
    expect(postedMessages).toEqual([{ type: 'stop', id: 'api' }]);
  });

  it('clicking Restart posts a restart message', () => {
    const { container } = render(<ServiceItem service={SERVICE} status="running" {...baseProps} />);
    fireEvent.click(container.querySelector('button[title="Restart"]')!);
    expect(postedMessages).toEqual([{ type: 'restart', id: 'api' }]);
  });

  it('does not render controls when showCheckbox is true (All tab)', () => {
    const { container } = render(
      <ServiceItem service={SERVICE} status="running" {...baseProps} showCheckbox={true} />,
    );
    expect(container.querySelectorAll('button').length).toBe(0);
  });
});

const LAUNCH: ServiceConfig = { id: 'web', name: 'Web', type: 'launch' };

describe('ServiceItem — launch (US2)', () => {
  beforeEach(() => resetPostedMessages());

  it('at stopped, renders two ActionButtons (run + debug) plus Restart', () => {
    const { container } = render(<ServiceItem service={LAUNCH} status="stopped" {...baseProps} />);
    // 2 actions + 1 restart
    expect(container.querySelectorAll('button').length).toBe(3);
    expect(container.querySelector('button[title="stopped — click to start"]')).not.toBeNull();
    expect(container.querySelector('button[title="stopped — click to start (debug)"]')).not.toBeNull();
  });

  it('at crashed, also renders both kinds plus Restart', () => {
    const { container } = render(<ServiceItem service={LAUNCH} status="crashed" {...baseProps} />);
    expect(container.querySelectorAll('button').length).toBe(3);
    expect(container.querySelector('button[title="crashed — click to start"]')).not.toBeNull();
    expect(container.querySelector('button[title="crashed — click to start (debug)"]')).not.toBeNull();
  });

  it('when not stopped (no prior click), renders only one ActionButton (run fallback)', () => {
    const { container } = render(<ServiceItem service={LAUNCH} status="running" {...baseProps} />);
    // 1 action + 1 restart
    expect(container.querySelectorAll('button').length).toBe(2);
    expect(container.querySelector('button[title="running — click to stop"]')).not.toBeNull();
  });

  it('clicking debug at stopped posts start with mode debug', () => {
    const { container } = render(<ServiceItem service={LAUNCH} status="stopped" {...baseProps} />);
    fireEvent.click(container.querySelector('button[title="stopped — click to start (debug)"]')!);
    expect(postedMessages).toEqual([{ type: 'start', id: 'web', mode: 'debug' }]);
  });

  it('clicking run at stopped posts start with mode run', () => {
    const { container } = render(<ServiceItem service={LAUNCH} status="stopped" {...baseProps} />);
    fireEvent.click(container.querySelector('button[title="stopped — click to start"]')!);
    expect(postedMessages).toEqual([{ type: 'start', id: 'web', mode: 'run' }]);
  });

  it('after clicking debug then transitioning to running, only the active button remains', () => {
    const { container, rerender } = render(
      <ServiceItem service={LAUNCH} status="stopped" {...baseProps} />,
    );
    fireEvent.click(container.querySelector('button[title="stopped — click to start (debug)"]')!);
    rerender(<ServiceItem service={LAUNCH} status="running" {...baseProps} />);
    // 1 action + 1 restart — second button (run) hidden while not stopped
    expect(container.querySelectorAll('button').length).toBe(2);
    expect(container.querySelector('button[title="running — click to stop"]')).not.toBeNull();
  });

  it('when status returns to stopped, both buttons reappear', () => {
    const { container, rerender } = render(
      <ServiceItem service={LAUNCH} status="stopped" {...baseProps} />,
    );
    fireEvent.click(container.querySelector('button[title="stopped — click to start (debug)"]')!);
    rerender(<ServiceItem service={LAUNCH} status="running" {...baseProps} />);
    expect(container.querySelectorAll('button').length).toBe(2);
    rerender(<ServiceItem service={LAUNCH} status="stopped" {...baseProps} />);
    expect(container.querySelectorAll('button').length).toBe(3);
  });
});
