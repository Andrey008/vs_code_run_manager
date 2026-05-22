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

interface ExistingImport {
  originId: string;
  id: string;
  name: string;
}

/**
 * Merge mapped services into `.vscode/services.json`.
 *
 * Smart sync: a service is matched to an earlier import by `source` + `originId`
 * and updated in place; an unmatched configuration is appended to the dedicated
 * `JetBrains` group; a previously imported service whose source configuration is
 * gone is marked `stale` (never deleted). Existing services, comments, and
 * formatting are preserved; colliding ids are suffixed; a malformed
 * `services.json` aborts the write.
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
  const existingImports = collectJetBrainsServices(text);
  const usedIds = new Set(collectServiceIds(text));
  const importedOriginIds = new Set(importable.map(m => m.originId));

  for (const m of importable) {
    const service: ServiceConfig = { ...(m.service as ServiceConfig) };
    const match = existingImports.find(e => e.originId === m.originId);

    let outcome: ImportOutcome;
    if (match) {
      service.id = match.id; // keep the id the developer may already depend on
      text = replaceService(text, m.originId, service, formatting);
      outcome = 'updated';
    } else {
      service.id = uniqueId(service.id, usedIds);
      usedIds.add(service.id);
      text = appendService(text, service, formatting);
      outcome = m.confidence === 'needs-review' ? 'needs-review' : 'imported';
    }

    entries.push({
      originName: m.originName,
      outcome,
      detail: m.notes.join(' ') || `${capitalize(outcome)} as service "${service.id}".`,
    });
  }

  // Imported services whose source configuration is gone are marked stale, not deleted.
  for (const existing of existingImports) {
    if (!importedOriginIds.has(existing.originId)) {
      text = markStale(text, existing.originId, formatting);
      entries.push({
        originName: existing.name,
        outcome: 'stale',
        detail: 'Source JetBrains configuration no longer exists — marked stale, not deleted.',
      });
    }
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

/** Replace a previously imported service (matched by originId) in place. */
function replaceService(
  text: string,
  originId: string,
  service: ServiceConfig,
  formatting: jsonc.FormattingOptions,
): string {
  const location = locateImport(text, originId);
  if (!location) {
    return text;
  }
  const edits = jsonc.modify(
    text,
    ['groups', location.groupIndex, 'services', location.serviceIndex],
    service,
    { formattingOptions: formatting },
  );
  return jsonc.applyEdits(text, edits);
}

/** Mark a previously imported service (matched by originId) as stale. */
function markStale(
  text: string,
  originId: string,
  formatting: jsonc.FormattingOptions,
): string {
  const location = locateImport(text, originId);
  if (!location) {
    return text;
  }
  const edits = jsonc.modify(
    text,
    ['groups', location.groupIndex, 'services', location.serviceIndex, 'stale'],
    true,
    { formattingOptions: formatting },
  );
  return jsonc.applyEdits(text, edits);
}

function locateImport(
  text: string,
  originId: string,
): { groupIndex: number; serviceIndex: number } | null {
  const root = jsonc.parse(text, [], { allowTrailingComma: true });
  if (!isObject(root) || !Array.isArray(root['groups'])) {
    return null;
  }
  const groups = root['groups'];
  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    if (!isObject(group) || !Array.isArray(group['services'])) {
      continue;
    }
    const services = group['services'];
    for (let si = 0; si < services.length; si++) {
      const svc = services[si];
      if (isObject(svc) && svc['source'] === 'jetbrains' && svc['originId'] === originId) {
        return { groupIndex: gi, serviceIndex: si };
      }
    }
  }
  return null;
}

function collectJetBrainsServices(text: string): ExistingImport[] {
  const root = jsonc.parse(text, [], { allowTrailingComma: true });
  const found: ExistingImport[] = [];
  if (isObject(root) && Array.isArray(root['groups'])) {
    for (const group of root['groups']) {
      if (!isObject(group) || !Array.isArray(group['services'])) {
        continue;
      }
      for (const svc of group['services']) {
        if (
          isObject(svc) &&
          svc['source'] === 'jetbrains' &&
          typeof svc['originId'] === 'string' &&
          typeof svc['id'] === 'string'
        ) {
          found.push({
            originId: svc['originId'],
            id: svc['id'],
            name: typeof svc['name'] === 'string' ? svc['name'] : svc['id'],
          });
        }
      }
    }
  }
  return found;
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
  const count = (outcome: ImportOutcome): number =>
    entries.filter(e => e.outcome === outcome).length;
  return {
    entries,
    counts: {
      imported: count('imported'),
      updated: count('updated'),
      needsReview: count('needs-review'),
      skipped: count('skipped'),
      stale: count('stale'),
    },
    aborted,
    abortReason,
  };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
