# Changelog

All notable changes to the Run Manager extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
