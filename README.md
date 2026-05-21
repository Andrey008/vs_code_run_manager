# Run Manager

> A unified VS Code panel to launch, monitor, and stop all of your local services — a faster, friendlier take on the IntelliJ IDEA **Services** panel.

Run Manager gives you one side panel for every process your project needs — shell commands, `launch.json` configurations, tasks, and Docker Compose services — with dependency-aware startup, health checks, and a live log terminal.

## Features

- **One panel for everything** — shell commands, `launch.json` configs (run *or* debug), `tasks.json` and auto-detected tasks (npm, gulp, …), and individual Docker Compose services.
- **Active dashboard** — build your own working set: pick the services you care about, create custom groups, and drag services between them. The layout is yours, independent of how services are defined.
- **Dependency-aware start** — declare `dependsOn` and Run Manager starts a whole group in the correct topological order with one click.
- **Health checks** — know when a service is actually *ready*, not just "process alive", via an HTTP ping or a log pattern.
- **Embedded log terminal** — full ANSI colour, per service, powered by xterm.js.
- **Run / Debug toggle** — launch configurations can start with the debugger attached, per service.

## Getting started

1. Install the extension.
2. Open the **Run Manager** view from the Activity Bar.
3. The **All** tab lists every service it discovers. Tick the ones you use to add them to the **Active** tab.
4. In **Active**, create groups and drag services to arrange your dashboard.
5. Use the per-service controls to Start / Stop / Restart, or **Start All** on a group.

## Configuration

Run Manager discovers services from three sources. The first two need no setup:

- **`.vscode/launch.json`** — every launch configuration is listed automatically.
- **VS Code tasks** — `.vscode/tasks.json` plus auto-detected tasks (npm scripts, gulp, …), grouped by source.
- **`.vscode/services.json`** — optional. Add shell commands, Docker Compose services, `dependsOn`, health checks, and per-service env files.

### `.vscode/services.json`

```jsonc
{
  "groups": [
    {
      "name": "Infrastructure",
      "services": [
        {
          "id": "mongodb",
          "name": "MongoDB",
          "type": "docker-compose",
          "file": "${workspaceFolder}/docker-compose.yml",
          "service": "mongodb",
          "healthCheck": {
            "type": "log-pattern",
            "pattern": "Waiting for connections",
            "timeout": 30
          }
        }
      ]
    },
    {
      "name": "Application",
      "services": [
        {
          "id": "api",
          "name": "API Server",
          "type": "shell",
          "cmd": "node server.js",
          "cwd": "${workspaceFolder}",
          "envFile": ".env.local",
          "dependsOn": ["mongodb"],
          "healthCheck": {
            "type": "http",
            "url": "http://localhost:3000/health",
            "readyWhen": 200,
            "timeout": 30
          }
        }
      ]
    }
  ]
}
```

### Service types

| `type`           | Runs                                                            |
|------------------|-----------------------------------------------------------------|
| `shell`          | A shell command (`cmd`, optional `cwd`).                        |
| `launch`         | A `launch.json` configuration, in run or debug mode.            |
| `task`           | A VS Code task (`taskName`).                                    |
| `docker-compose` | A single service from a Compose file (`file`, `service`).       |

## Development

```bash
npm install
npm run build      # bundle extension + webview with esbuild
npm test           # Jest unit tests
```

Press <kbd>F5</kbd> in VS Code to launch an Extension Development Host.

## License

[Apache-2.0](LICENSE)
