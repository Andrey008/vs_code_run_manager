import * as fs from 'fs';
import * as jsonc from 'jsonc-parser';
import type { ServiceConfig } from '../types';
import type {
  MappedService,
  ImportReport,
  ImportReportEntry,
  ImportOutcome,
} from './types';

/** Name of the dedicated group imported services are placed in. */
export const IMPORT_GROUP = 'JetBrains';

/**
 * Merge mapped services into `.vscode/services.json`.
 *
 * First-import semantics: imported services are added to a dedicated `JetBrains`
 * group; existing services, comments, and formatting are preserved; a colliding
 * service id is suffixed; a malformed `services.json` aborts the write.
 */
export function mergeImport(servicesJsonPath: string, mapped: MappedService[]): ImportReport {
  const entries: ImportReportEntry[] = [];

  // Configurations that produced no service are reported, never written.
  for (const m of mapped) {
    if (!m.service) {
      entries.push({
        originName: m.originName,
        outcome: 'skipped',
        detail: m.notes[0] ?? 'Unsupported configuration.',
      });
    }
  }
  const importable = mapped.filter(m => m.service !== null);

  let text: string;
  if (isFile(servicesJsonPath)) {
    text = fs.readFileSync(servicesJsonPath, 'utf-8');
    const errors: jsonc.ParseError[] = [];
    const root = jsonc.parse(text, errors, { allowTrailingComma: true });
    if (errors.length > 0 || !isObject(root) || !Array.isArray(root['groups'])) {
      return report(
        entries,
        true,
        'services.json is not valid JSONC — import cancelled, the file was left unchanged.',
      );
    }
  } else {
    text = '{\n  "groups": []\n}\n';
  }

  const formatting: jsonc.FormattingOptions = {
    tabSize: 2,
    insertSpaces: true,
    eol: text.includes('\r\n') ? '\r\n' : '\n',
  };
  const usedIds = new Set(collectServiceIds(text));

  for (const m of importable) {
    const service: ServiceConfig = { ...(m.service as ServiceConfig) };
    service.id = uniqueId(service.id, usedIds);
    usedIds.add(service.id);
    text = appendService(text, service, formatting);

    const outcome: ImportOutcome = m.confidence === 'needs-review' ? 'needs-review' : 'imported';
    entries.push({
      originName: m.originName,
      outcome,
      detail: m.notes.join(' ') || `Imported as service "${service.id}".`,
    });
  }

  fs.writeFileSync(servicesJsonPath, text, 'utf-8');
  return report(entries, false);
}

/** Append one service to the JetBrains group, creating the group if absent. */
function appendService(
  text: string,
  service: ServiceConfig,
  formatting: jsonc.FormattingOptions,
): string {
  const root = jsonc.parse(text, [], { allowTrailingComma: true }) as { groups?: unknown[] };
  const groups = Array.isArray(root.groups) ? root.groups : [];
  const groupIndex = groups.findIndex(g => isObject(g) && g['name'] === IMPORT_GROUP);

  if (groupIndex === -1) {
    const edits = jsonc.modify(
      text,
      ['groups', groups.length],
      { name: IMPORT_GROUP, services: [service] },
      { formattingOptions: formatting, isArrayInsertion: true },
    );
    return jsonc.applyEdits(text, edits);
  }

  const group = groups[groupIndex] as { services?: unknown[] };
  const servicesLen = Array.isArray(group.services) ? group.services.length : 0;
  const edits = jsonc.modify(
    text,
    ['groups', groupIndex, 'services', servicesLen],
    service,
    { formattingOptions: formatting, isArrayInsertion: true },
  );
  return jsonc.applyEdits(text, edits);
}

function collectServiceIds(text: string): string[] {
  const root = jsonc.parse(text, [], { allowTrailingComma: true });
  const ids: string[] = [];
  if (isObject(root) && Array.isArray(root['groups'])) {
    for (const group of root['groups']) {
      if (isObject(group) && Array.isArray(group['services'])) {
        for (const svc of group['services']) {
          if (isObject(svc) && typeof svc['id'] === 'string') {
            ids.push(svc['id']);
          }
        }
      }
    }
  }
  return ids;
}

function uniqueId(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    return base;
  }
  let candidate = `${base}-jetbrains`;
  let n = 2;
  while (used.has(candidate)) {
    candidate = `${base}-jetbrains-${n++}`;
  }
  return candidate;
}

function report(
  entries: ImportReportEntry[],
  aborted: boolean,
  abortReason?: string,
): ImportReport {
  return {
    entries,
    counts: {
      imported: entries.filter(e => e.outcome === 'imported').length,
      needsReview: entries.filter(e => e.outcome === 'needs-review').length,
      skipped: entries.filter(e => e.outcome === 'skipped').length,
      stale: entries.filter(e => e.outcome === 'stale').length,
    },
    aborted,
    abortReason,
  };
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
