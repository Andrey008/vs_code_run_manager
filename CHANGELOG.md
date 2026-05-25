# Changelog

All notable changes to the Run Manager extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2026-05-25

### Changed

- **Consolidated service controls** — every service row now has a single
  **morphing action button** whose shape and ring convey the status: green Play ▶
  when stopped, red square with a clock-face orange spinner while starting,
  plain red square when running, red square with a thin green ring when ready
  (health-check passed), amber ⚠ when crashed. The standalone status badge is
  gone. **Restart** stays separate and always visible.
- **`launch` services**: at rest you see two buttons — Run and a custom Debug
  bug icon. Clicking either launches the service in that mode; while the service
  runs, only the active button is shown, and both reappear when it returns to
  stopped. The previous run/debug mode toggle is removed. **Start All** for a
  group launches every `launch` service in run mode; the per-service `mode`
  field in `services.json` (if set) remains as the implicit default.

### Fixed

- **Stop now reliably kills shell-wrapped processes.** The `sh -c "…"` wrapper
  used by `shell` services is spawned `detached: true`, and Stop / Restart now
  signal the whole process group (`process.kill(-pid, sig)`), so long-running
  children — e.g. a JVM with retry-loop signal handlers — actually receive
  SIGTERM/SIGKILL instead of being orphaned.

## [1.1.0] - 2026-05-22

### Added

- **Import from JetBrains** — discover JetBrains run/debug configurations from
  `.idea/runConfigurations/*.xml` and `.idea/workspace.xml` and migrate them into
  `.vscode/services.json`. Available as the **Run Manager: Import from JetBrains**
  command and as an opt-in prompt on activation. Imports are previewed before
  writing, never modify `launch.json`, preserve existing `services.json` content
  and comments, and can be re-run safely — matched services are updated in place
  and a configuration removed in JetBrains is flagged stale rather than deleted.

## [1.0.0] - 2026-05-21

Initial release.

### Added

- Unified **Run Manager** side panel for launching, monitoring, and stopping local services.
- Support for four service types: `shell`, `launch` (run/debug), `task`, and `docker-compose`.
- Service discovery from `.vscode/launch.json`, the VS Code task API (`tasks.json` plus
  auto-detected npm/gulp/… tasks, grouped by source), and an optional `.vscode/services.json`.
- **All** tab — every discovered service, with checkboxes to add services to the dashboard.
- **Active** tab — a user-owned dashboard with custom groups and drag-and-drop arrangement.
- Dependency-aware startup: `dependsOn` resolved by topological sort, with cyclic-dependency detection.
- **Start All** for a group, starting services in dependency order.
- Health checks: HTTP ping and log-pattern matching, surfacing a `ready` state.
- Embedded per-service log terminal with full ANSI colour (xterm.js).
- Run / Debug mode toggle for launch configurations.
