const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { activityFor } = require('../activity');

function setup(login = async () => {}) {
  const calls = [];
  const clients = [];
  const timers = new Map();
  let nextTimer = 0;
  let onEditorChange;
  let onConfigChange;
  let applicationId = '1562163004550946826';
  const commands = {};
  const messages = [];
  const status = { show() {}, dispose() {} };
  const editor = name => ({ document: { languageId: 'javascript', uri: { path: `/work/${name}` } } });
  const vscode = {
    StatusBarAlignment: { Left: 1 },
    commands: { registerCommand: (name, callback) => { commands[name] = callback; return { dispose() {} }; } },
    window: {
      createStatusBarItem: () => status,
      showErrorMessage: message => messages.push(message),
      activeTextEditor: editor('one.js'),
      createOutputChannel: () => ({ appendLine() {} }),
      onDidChangeActiveTextEditor: callback => { onEditorChange = callback; },
    },
    workspace: {
      getConfiguration: () => ({ get: (key, fallback) => key === 'applicationId' ? applicationId : fallback }),
      getWorkspaceFolder: () => undefined,
      onDidChangeConfiguration: callback => { onConfigChange = callback; },
    },
  };
  class Client {
    constructor({ clientId }) {
      this.clientId = clientId;
      this.handlers = {};
      clients.push(this);
      this.user = { setActivity: async activity => { calls.push(activity); }, clearActivity: async () => {} };
    }
    async login() { await login(this); }
    on(event, callback) { this.handlers[event] = callback; }
    removeAllListeners() {}
    async destroy() { this.destroyed = true; }
  }
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'extension.js'), 'utf8'), {
    module,
    require: id => id === 'vscode' ? vscode : id === '@xhayper/discord-rpc' ? { Client } : { activityFor },
    setTimeout: (callback, ms) => { const id = ++nextTimer; timers.set(id, { callback, ms }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  const { activate, deactivate } = module.exports;
  activate({ subscriptions: [] });
  return { calls, clients, timers, vscode, status, messages, deactivate,
    command: name => commands['discordCodingPresence.' + name](),
    onEditorChange: () => onEditorChange(),
    onConfigChange: () => onConfigChange({ affectsConfiguration: () => true }),
    setApplicationId: id => { applicationId = id; },
  };
}

const flush = () => new Promise(setImmediate);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('editor switches send one settled activity and skip repeats', async () => {
  const beforeActivation = Date.now();
  const { calls, clients, timers, vscode, onEditorChange, deactivate } = setup();
  const editor = name => ({ document: { languageId: 'javascript', uri: { path: `/work/${name}` } } });
  await new Promise(setImmediate);
  assert.equal(calls.length, 1);
  const startedAt = calls[0].startTimestamp;
  assert.ok(startedAt >= beforeActivation && startedAt <= Date.now());

  vscode.window.activeTextEditor = undefined;
  onEditorChange();
  vscode.window.activeTextEditor = editor('two.js');
  onEditorChange();
  assert.equal(timers.size, 1);
  const [id, timer] = [...timers][0];
  assert.equal(timer.ms, 250);
  timers.delete(id);
  timer.callback();
  await new Promise(setImmediate);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].details, 'Editing two.js');
  assert.equal(calls[1].startTimestamp, startedAt);

  onEditorChange();
  const [repeatId, repeatTimer] = [...timers][0];
  timers.delete(repeatId);
  repeatTimer.callback();
  await new Promise(setImmediate);
  assert.equal(calls.length, 2);

  clients[0].handlers.disconnected();
  await new Promise(setImmediate);
  const [retryId, retryTimer] = [...timers][0];
  timers.delete(retryId);
  retryTimer.callback();
  await new Promise(setImmediate);
  assert.equal(calls.length, 3);
  assert.equal(calls[2].startTimestamp, startedAt);
  await deactivate();
});


test('manual disconnect pauses retries and settings; connect uses a fresh client', async () => {
  const h = setup();
  await flush();
  assert.match(h.status.text, /Disconnect/);
  assert.equal(h.status.command, 'discordCodingPresence.disconnect');
  const startedAt = h.calls[0].startTimestamp;
  let cleared = false;
  h.clients[0].user.clearActivity = async () => { cleared = true; };
  await h.command('disconnect');
  assert.ok(cleared);
  assert.ok(h.clients[0].destroyed);
  assert.match(h.status.text, /Connect$/);
  h.onConfigChange();
  h.onEditorChange();
  for (const [id, timer] of h.timers) { h.timers.delete(id); timer.callback(); }
  await flush();
  assert.equal(h.clients.length, 1);
  await h.command('connect');
  assert.equal(h.clients.length, 2);
  assert.equal(h.calls[1].startTimestamp, startedAt);
  await h.command('connect');
  assert.ok(h.clients[1].destroyed);
  assert.equal(h.clients.length, 3);
  h.clients[2].handlers.disconnected();
  await flush();
  assert.equal(h.timers.size, 1);
  await h.command('connect');
  assert.equal(h.timers.size, 0);
  h.clients[3].handlers.disconnected();
  await flush();
  await h.command('disconnect');
  assert.equal(h.timers.size, 0);
  await h.deactivate();
});

test('cancel login and ignore its late failure; repeated Connect is ignored', async () => {
  const first = deferred();
  const second = deferred();
  let attempts = 0;
  const h = setup(() => (++attempts === 1 ? first : second).promise);
  assert.match(h.status.text, /Connecting/);
  assert.equal(h.status.command, 'discordCodingPresence.disconnect');
  await h.command('disconnect');
  const connecting = h.command('connect');
  await h.command('connect');
  await flush();
  assert.equal(h.clients.length, 2);
  first.reject(new Error('old login failed'));
  await flush();
  assert.equal(h.clients[1].destroyed, undefined);
  second.resolve();
  await connecting;
  assert.match(h.status.text, /Disconnect/);
  assert.equal(h.calls.length, 1);
  await h.deactivate();
});

test('old activity failures cannot close a new client', async () => {
  const h = setup();
  await flush();
  const pending = deferred();
  h.clients[0].user.setActivity = () => pending.promise;
  h.vscode.window.activeTextEditor = undefined;
  h.onConfigChange();
  await h.command('connect');
  pending.reject(new Error('old update failed'));
  await flush();
  assert.equal(h.clients[1].destroyed, undefined);
  assert.match(h.status.text, /Disconnect/);
  assert.equal(h.timers.size, 0);
  await h.deactivate();
});

test('invalid ID is actionable and cleanup failures leave controls usable', async () => {
  const h = setup();
  await flush();
  h.setApplicationId('invalid');
  await h.command('connect');
  assert.match(h.messages[0], /application ID/);
  assert.equal(h.clients.length, 1);
  h.clients[0].destroy = async () => { throw new Error('already closed'); };
  await h.command('disconnect');
  assert.match(h.status.text, /Connect$/);
  h.setApplicationId('1562163004550946826');
  await h.command('connect');
  assert.match(h.status.text, /Disconnect/);
  await h.deactivate();
});
