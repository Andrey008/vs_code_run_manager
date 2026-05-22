import { EventEmitter as NodeEventEmitter } from 'events';

// --- debug ---
const _onDidTerminateDebugSession = new NodeEventEmitter().setMaxListeners(50);
const _onDidStartDebugSession = new NodeEventEmitter().setMaxListeners(50);

export const debug = {
  startDebugging: jest.fn().mockResolvedValue(true),
  stopDebugging: jest.fn().mockResolvedValue(undefined),
  onDidStartDebugSession: (cb: (session: unknown) => void) => {
    _onDidStartDebugSession.on('event', cb);
    return { dispose: () => _onDidStartDebugSession.off('event', cb) };
  },
  onDidTerminateDebugSession: (cb: (session: unknown) => void) => {
    _onDidTerminateDebugSession.on('event', cb);
    return { dispose: () => _onDidTerminateDebugSession.off('event', cb) };
  },
  _fireStart: (session: unknown) => _onDidStartDebugSession.emit('event', session),
  _fireTerminate: (session: unknown) => _onDidTerminateDebugSession.emit('event', session),
};

// --- workspace ---
const _onDidSaveTextDocument = new NodeEventEmitter();

export const workspace = {
  workspaceFolders: [{ uri: { fsPath: '/mock/workspace' }, name: 'mock', index: 0 }] as
    | { uri: { fsPath: string }; name: string; index: number }[]
    | undefined,
  getConfiguration: jest.fn().mockReturnValue({
    get: jest.fn().mockReturnValue(undefined),
  }),
  onDidSaveTextDocument: (cb: (doc: unknown) => void) => {
    _onDidSaveTextDocument.on('event', cb);
    return { dispose: () => _onDidSaveTextDocument.off('event', cb) };
  },
  createFileSystemWatcher: jest.fn().mockReturnValue({
    onDidChange: jest.fn(),
    onDidCreate: jest.fn(),
    onDidDelete: jest.fn(),
    dispose: jest.fn(),
  }),
  fs: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    stat: jest.fn(),
  },
};

// --- window ---
const _onDidOpenTerminal = new NodeEventEmitter().setMaxListeners(50);
const _onDidCloseTerminal = new NodeEventEmitter().setMaxListeners(50);

export const window = {
  createWebviewPanel: jest.fn(),
  registerWebviewViewProvider: jest.fn().mockReturnValue({ dispose: jest.fn() }),
  terminals: [] as { name: string; show: () => void }[],
  showErrorMessage: jest.fn(),
  showWarningMessage: jest.fn(),
  showInformationMessage: jest.fn(),
  showQuickPick: jest.fn(),
  createOutputChannel: jest.fn().mockReturnValue({
    appendLine: jest.fn(),
    append: jest.fn(),
    show: jest.fn(),
    dispose: jest.fn(),
  }),
  onDidOpenTerminal: (cb: (terminal: unknown) => void) => {
    _onDidOpenTerminal.on('event', cb);
    return { dispose: () => _onDidOpenTerminal.off('event', cb) };
  },
  onDidCloseTerminal: (cb: (terminal: unknown) => void) => {
    _onDidCloseTerminal.on('event', cb);
    return { dispose: () => _onDidCloseTerminal.off('event', cb) };
  },
  _fireOpenTerminal: (terminal: unknown) => _onDidOpenTerminal.emit('event', terminal),
  _fireCloseTerminal: (terminal: unknown) => _onDidCloseTerminal.emit('event', terminal),
};

// --- tasks ---
const _onDidEndTaskProcess = new NodeEventEmitter();
const _onDidStartTaskProcess = new NodeEventEmitter();

export const tasks = {
  executeTask: jest.fn().mockResolvedValue({ terminate: jest.fn() }),
  fetchTasks: jest.fn().mockResolvedValue([]),
  onDidEndTaskProcess: (cb: (e: unknown) => void) => {
    _onDidEndTaskProcess.on('event', cb);
    return { dispose: () => _onDidEndTaskProcess.off('event', cb) };
  },
  onDidStartTaskProcess: (cb: (e: unknown) => void) => {
    _onDidStartTaskProcess.on('event', cb);
    return { dispose: () => _onDidStartTaskProcess.off('event', cb) };
  },
  _fireEndTask: (e: unknown) => _onDidEndTaskProcess.emit('event', e),
  _fireStartTask: (e: unknown) => _onDidStartTaskProcess.emit('event', e),
};

// --- misc ---
export const Uri = {
  file: jest.fn((path: string) => ({ fsPath: path, scheme: 'file', path })),
  parse: jest.fn((uri: string) => ({ fsPath: uri, scheme: 'file', path: uri })),
  joinPath: jest.fn((base: { fsPath: string }, ...parts: string[]) => ({
    fsPath: [base.fsPath, ...parts].join('/'),
    scheme: 'file',
    path: [base.fsPath, ...parts].join('/'),
  })),
};

export const ViewColumn = { One: 1, Two: 2, Three: 3, Active: -1, Beside: -2 };
export const ExtensionContext = {};

export const commands = {
  registerCommand: jest.fn().mockReturnValue({ dispose: jest.fn() }),
  executeCommand: jest.fn(),
};

export const env = { uriScheme: 'vscode' };

export const Disposable = {
  from: (...disposables: { dispose(): unknown }[]) => ({
    dispose: () => disposables.forEach(d => d.dispose()),
  }),
};

export const ThemeIcon = jest.fn().mockImplementation((id: string) => ({ id }));
export const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 };

export const EventEmitter: new <T>() => {
  event: (listener: (e: T) => unknown) => { dispose(): void };
  fire(data: T): void;
  dispose(): void;
} = jest.fn().mockImplementation(() => {
  const listeners: ((e: unknown) => unknown)[] = [];
  return {
    event: jest.fn((listener: (e: unknown) => unknown) => {
      listeners.push(listener);
      return { dispose: jest.fn() };
    }),
    fire: jest.fn((data: unknown) => listeners.forEach(l => l(data))),
    dispose: jest.fn(),
  };
});
