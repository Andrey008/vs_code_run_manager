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
