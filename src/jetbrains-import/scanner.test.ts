import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { scanJetBrainsConfigs } from './scanner';

const FIXTURES = path.join(__dirname, '__fixtures__');

function makeWorkspace(withIdea: boolean): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'jb-scan-'));
  if (withIdea) {
    const runConfigs = path.join(ws, '.idea', 'runConfigurations');
    fs.mkdirSync(runConfigs, { recursive: true });
    for (const f of ['shell-script.xml', 'node-server.xml']) {
      fs.copyFileSync(path.join(FIXTURES, 'runConfigurations', f), path.join(runConfigs, f));
    }
    fs.copyFileSync(path.join(FIXTURES, 'workspace.xml'), path.join(ws, '.idea', 'workspace.xml'));
  }
  return ws;
}

describe('scanJetBrainsConfigs', () => {
  it('finds shared run-config files and the personal workspace file', () => {
    const ws = makeWorkspace(true);
    const found = scanJetBrainsConfigs(ws);

    expect(found).toHaveLength(3);
    expect(found.filter(f => f.provenance === 'shared')).toHaveLength(2);
    expect(found.filter(f => f.provenance === 'personal')).toHaveLength(1);
    expect(found.every(f => f.xml.includes('<'))).toBe(true);

    fs.rmSync(ws, { recursive: true, force: true });
  });

  it('returns an empty list when the workspace has no .idea directory', () => {
    const ws = makeWorkspace(false);
    expect(scanJetBrainsConfigs(ws)).toEqual([]);
    fs.rmSync(ws, { recursive: true, force: true });
  });
});
