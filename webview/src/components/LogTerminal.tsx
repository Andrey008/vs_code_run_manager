import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import type { ServiceType } from '../types';

interface Props {
  serviceId: string | null;
  serviceType: ServiceType | null;
  logs: Record<string, string[]>;
}

const terminalCache = new Map<string, Terminal>();

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function getOrCreateTerminal(id: string): Terminal {
  if (!terminalCache.has(id)) {
    const term = new Terminal({
      convertEol: true,
      scrollback: 2000,
      theme: {
        background: cssVar('--vscode-terminal-background', '#1e1e1e'),
        foreground: cssVar('--vscode-terminal-foreground', '#cccccc'),
        cursor:     cssVar('--vscode-terminalCursor-foreground', '#cccccc'),
      },
      fontFamily: cssVar('--vscode-editor-font-family', 'monospace'),
      fontSize: 13,
    });
    terminalCache.set(id, term);
  }
  return terminalCache.get(id)!;
}

export function LogTerminal({ serviceId, serviceType, logs }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!serviceId || !containerRef.current) return;
    if (serviceType === 'launch' || serviceType === 'task') return;

    const term = getOrCreateTerminal(serviceId);

    if (activeIdRef.current !== serviceId) {
      while (containerRef.current.firstChild) {
        containerRef.current.removeChild(containerRef.current.firstChild);
      }
      if (!term.element) {
        term.open(containerRef.current);
        const buffered = logs[serviceId] ?? [];
        for (const chunk of buffered) term.write(chunk);
      } else {
        containerRef.current.appendChild(term.element);
      }
      activeIdRef.current = serviceId;
    }
  }, [serviceId, serviceType]);

  const prevLogsRef = useRef<Record<string, number>>({});
  useEffect(() => {
    if (!serviceId || serviceType === 'launch' || serviceType === 'task') return;
    const chunks = logs[serviceId] ?? [];
    const prev = prevLogsRef.current[serviceId] ?? 0;
    if (chunks.length > prev) {
      const term = terminalCache.get(serviceId);
      if (term) {
        for (let i = prev; i < chunks.length; i++) term.write(chunks[i]);
      }
      prevLogsRef.current[serviceId] = chunks.length;
    }
  }, [serviceId, serviceType, logs]);

  if (!serviceId) {
    return <Placeholder text="Select a service to view output" />;
  }

  if (serviceType === 'launch') {
    return <Placeholder text="Output is in the VS Code integrated terminal" sub="Launch configs run inside VS Code's terminal — look for the tab that opened when you started this service." />;
  }

  if (serviceType === 'task') {
    return <Placeholder text="Output is in the VS Code terminal panel" sub="Tasks run in VS Code's built-in terminal. Open it with Ctrl+`." />;
  }

  const hasLogs = (logs[serviceId]?.length ?? 0) > 0;
  if (!hasLogs) {
    return <Placeholder text="No output yet" sub="Start the service to see logs here." />;
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }} />
  );
}

function Placeholder({ text, sub }: { text: string; sub?: string }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      gap: '6px',
      padding: '16px',
      textAlign: 'center',
    }}>
      <span style={{ color: 'var(--vscode-descriptionForeground)', fontSize: '12px' }}>{text}</span>
      {sub && <span style={{ color: 'var(--vscode-descriptionForeground)', fontSize: '11px', opacity: 0.7 }}>{sub}</span>}
    </div>
  );
}
