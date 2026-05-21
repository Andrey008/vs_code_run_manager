import * as path from 'path';
import { parseServicesConfig, resolveWorkspaceVars } from './configParser';
import type { ServicesConfig } from '../types';

const WORKSPACE = '/mock/workspace';

const VALID_CONFIG: ServicesConfig = {
  groups: [
    {
      name: 'Infrastructure',
      services: [
        {
          id: 'mongodb',
          name: 'MongoDB',
          type: 'docker-compose',
          file: '${workspaceFolder}/docker-compose.yml',
          service: 'mongodb',
        },
      ],
    },
    {
      name: 'Application',
      services: [
        {
          id: 'api',
          name: 'API Server',
          type: 'shell',
          cmd: 'node server.js',
          cwd: '${workspaceFolder}',
          dependsOn: ['mongodb'],
          healthCheck: {
            type: 'http',
            url: 'http://localhost:3000/health',
            readyWhen: 200,
            timeout: 30,
          },
        },
      ],
    },
  ],
};

describe('configParser', () => {
  describe('parseServicesConfig', () => {
    it('parses valid services.json', () => {
      const raw = JSON.stringify(VALID_CONFIG);
      const result = parseServicesConfig(raw, WORKSPACE);

      expect(result.groups).toHaveLength(2);
      expect(result.groups[0].name).toBe('Infrastructure');
      expect(result.groups[0].services[0].id).toBe('mongodb');
    });

    it('throws on missing required field: id', () => {
      const raw = JSON.stringify({
        groups: [
          {
            name: 'Test',
            services: [{ name: 'NoId', type: 'shell', cmd: 'echo hi' }],
          },
        ],
      });
      expect(() => parseServicesConfig(raw, WORKSPACE)).toThrow(/id/i);
    });

    it('throws on missing required field: name', () => {
      const raw = JSON.stringify({
        groups: [
          {
            name: 'Test',
            services: [{ id: 'svc', type: 'shell', cmd: 'echo hi' }],
          },
        ],
      });
      expect(() => parseServicesConfig(raw, WORKSPACE)).toThrow(/name/i);
    });

    it('throws on missing required field: type', () => {
      const raw = JSON.stringify({
        groups: [
          {
            name: 'Test',
            services: [{ id: 'svc', name: 'Service' }],
          },
        ],
      });
      expect(() => parseServicesConfig(raw, WORKSPACE)).toThrow(/type/i);
    });

    it('throws on invalid type value', () => {
      const raw = JSON.stringify({
        groups: [
          {
            name: 'Test',
            services: [{ id: 'svc', name: 'Service', type: 'invalid-type' }],
          },
        ],
      });
      expect(() => parseServicesConfig(raw, WORKSPACE)).toThrow(/type/i);
    });

    it('resolves ${workspaceFolder} in paths', () => {
      const raw = JSON.stringify(VALID_CONFIG);
      const result = parseServicesConfig(raw, WORKSPACE);

      const mongoService = result.groups[0].services[0] as { file?: string };
      expect(mongoService.file).toBe(`${WORKSPACE}/docker-compose.yml`);

      const apiService = result.groups[1].services[0] as { cwd?: string };
      expect(apiService.cwd).toBe(WORKSPACE);
    });

    it('returns empty groups array for empty config', () => {
      const raw = JSON.stringify({ groups: [] });
      const result = parseServicesConfig(raw, WORKSPACE);
      expect(result.groups).toHaveLength(0);
    });

    it('handles JSONC comments without errors', () => {
      const jsonc = `{
        // This is a JSONC comment
        "groups": [
          {
            "name": "Test", // inline comment
            "services": [
              {
                "id": "svc",
                "name": "Service",
                "type": "shell",
                "cmd": "echo hi"
              }
            ]
          }
        ]
      }`;
      const result = parseServicesConfig(jsonc, WORKSPACE);
      expect(result.groups).toHaveLength(1);
    });

    it('throws on completely invalid JSON', () => {
      expect(() => parseServicesConfig('not json at all', WORKSPACE)).toThrow();
    });

    it('throws on missing groups key', () => {
      const raw = JSON.stringify({ services: [] });
      expect(() => parseServicesConfig(raw, WORKSPACE)).toThrow(/groups/i);
    });

    it('preserves healthCheck configuration', () => {
      const raw = JSON.stringify(VALID_CONFIG);
      const result = parseServicesConfig(raw, WORKSPACE);
      const apiService = result.groups[1].services[0];

      expect(apiService.healthCheck).toBeDefined();
      expect(apiService.healthCheck!.type).toBe('http');
      expect((apiService.healthCheck as { url: string }).url).toBe(
        'http://localhost:3000/health'
      );
    });

    it('preserves dependsOn references', () => {
      const raw = JSON.stringify(VALID_CONFIG);
      const result = parseServicesConfig(raw, WORKSPACE);
      const apiService = result.groups[1].services[0];

      expect(apiService.dependsOn).toEqual(['mongodb']);
    });

    it('normalizes mode field default to "run"', () => {
      const raw = JSON.stringify({
        groups: [
          {
            name: 'Test',
            services: [{ id: 'svc', name: 'Service', type: 'shell', cmd: 'echo hi' }],
          },
        ],
      });
      const result = parseServicesConfig(raw, WORKSPACE);
      expect(result.groups[0].services[0].mode).toBe('run');
    });
  });

  describe('resolveWorkspaceVars', () => {
    it('replaces ${workspaceFolder} in a string', () => {
      expect(resolveWorkspaceVars('${workspaceFolder}/foo', WORKSPACE)).toBe(
        `${WORKSPACE}/foo`
      );
    });

    it('handles strings without the variable', () => {
      expect(resolveWorkspaceVars('no/variable/here', WORKSPACE)).toBe('no/variable/here');
    });

    it('replaces multiple occurrences', () => {
      const input = '${workspaceFolder}/a:${workspaceFolder}/b';
      expect(resolveWorkspaceVars(input, WORKSPACE)).toBe(
        `${WORKSPACE}/a:${WORKSPACE}/b`
      );
    });
  });
});
