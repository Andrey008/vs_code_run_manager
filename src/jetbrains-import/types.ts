import type { ServiceConfig } from '../types';

/** Where a JetBrains run configuration was found. */
export type ConfigProvenance = 'shared' | 'personal';

/**
 * Normalized JetBrains run configuration — the output of the parser.
 * Pure data; contains no VS Code types.
 */
export interface JetBrainsRunConfig {
  /** The configuration's display name. */
  name: string;
  /** Raw JetBrains `type` attribute, e.g. "ShConfigurationType". */
  type: string;
  /** `shared` = .idea/runConfigurations/*.xml; `personal` = .idea/workspace.xml. */
  provenance: ConfigProvenance;
  /** Flattened type-specific settings (script path, task names, goals, …). */
  options: Record<string, string>;
  /** Inline environment variables, if any. */
  envVars: Record<string, string>;
  /** Referenced env file path, if any. */
  envFile?: string;
  /** Working directory, if specified. */
  workingDir?: string;
}

/** How confidently a JetBrains config maps to a Run Manager service. */
export type MappingConfidence = 'clean' | 'needs-review' | 'unmapped';

/** The result of mapping one JetBrainsRunConfig to a Run Manager service. */
export interface MappedService {
  /** Stable key of the source config; written onto the service. */
  originId: string;
  /** The JetBrains config name, for display in the preview and report. */
  originName: string;
  /** Drives preview badges and report grouping. */
  confidence: MappingConfidence;
  /** The constructed service, or null when `confidence` is "unmapped". */
  service: ServiceConfig | null;
  /** Human-readable caveats for the developer. */
  notes: string[];
}

/** Final disposition of one discovered configuration in a run. */
export type ImportOutcome =
  | 'imported'
  | 'updated'
  | 'needs-review'
  | 'skipped'
  | 'stale';

/** One line of the import report. */
export interface ImportReportEntry {
  originName: string;
  outcome: ImportOutcome;
  detail: string;
}

/** The summary of a single import run. */
export interface ImportReport {
  /** One entry per discovered configuration — no silent drops (FR-017). */
  entries: ImportReportEntry[];
  counts: {
    imported: number;
    needsReview: number;
    skipped: number;
    stale: number;
  };
  /** True when the write was aborted (e.g. malformed services.json, FR-015). */
  aborted: boolean;
  abortReason?: string;
}
