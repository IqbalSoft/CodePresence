const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { activityFor } = require('../activity');

test('editor switches send one settled activity and skip repeats', async () => {
  const calls = [];
  const clients = [];
  const timers = new Map();
  let nextTimer = 0;
  let onEditorChange;
  const editor = name => ({ document: { languageId: 'javascript', uri: { path: `/work/${name}` } } });
  const vscode = {
    window: {
      activeTextEditor: editor('one.js'),
      createOutputChannel: () => ({ appendLine() {} }),
      onDidChangeActiveTextEditor: callback => { onEditorChange = callback; },
    },
    workspace: {
      getConfiguration: () => ({ get: (key, fallback) => key === 'applicationId' ? '1562163004550946826' : fallback }),
      getWorkspaceFolder: () => undefined,
      onDidChangeConfiguration() {},
    },
  };
  class Client {
    constructor({ clientId }) {
      this.clientId = clientId;
      this.handlers = {};
      clients.push(this);
      this.user = { setActivity: async activity => { calls.push(activity); }, clearActivity: async () => {} };
    }
    async login() {}
    on(event, callback) { this.handlers[event] = callback; }
    removeAllListeners() {}
    async destroy() {}
  }
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'extension.js'), 'utf8'), {
    module,
    require: id => id === 'vscode' ? vscode : id === '@xhayper/discord-rpc' ? { Client } : { activityFor },
    setTimeout: (callback, ms) => { const id = ++nextTimer; timers.set(id, { callback, ms }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  const { activate, deactivate } = module.exports;
  const beforeActivation = Date.now();
  activate({ subscriptions: [] });
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
