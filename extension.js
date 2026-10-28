const vscode = require('vscode');
const { Client } = require('@xhayper/discord-rpc');
const { activityFor } = require('./activity');

let shutdown;

function activate(context) {
  const output = vscode.window.createOutputChannel('Discord Coding Presence');
  context.subscriptions.push(output);
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
  context.subscriptions.push(status);
  status.show();
  const startedAt = Date.now();
  let client;
  let retryTimer;
  let updateTimer;
  let lastActivity;
  let stopped = false;
  let paused = false;
  let revision = 0;
  let manualConnect;

  function showStatus(state) {
    status.text = state === 'connecting' ? '$(sync~spin) Discord: Connecting…'
      : state === 'connected' ? '$(plug) Discord: Disconnect' : '$(debug-disconnect) Discord: Connect';
    status.command = state === 'disconnected' ? 'discordCodingPresence.connect' : 'discordCodingPresence.disconnect';
    status.tooltip = state === 'connecting' ? 'Cancel Discord connection'
      : state === 'connected' ? 'Disconnect Discord presence' : 'Connect Discord presence';
  }
  showStatus('disconnected');

  const settings = () => vscode.workspace.getConfiguration('discordCodingPresence');
  const appId = () => settings().get('applicationId', '').trim();

  async function retire(clear = false) {
    const old = client;
    client = undefined;
    lastActivity = undefined;
    showStatus('disconnected');
    if (!old) return;
    old.removeAllListeners();
    if (clear && old.user) {
      try { await old.user.clearActivity(); } catch (_) { /* Discord may already be closed. */ }
    }
    try { await old.destroy(); } catch (error) { output.appendLine(`Could not close Discord connection: ${error}`); }
  }

  function retry() {
    if (!stopped && !paused && !retryTimer && /^\d{17,20}$/.test(appId())) {
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        void connect();
      }, 15000);
    }
  }

  async function update() {
    const current = client;
    if (stopped || paused || !current?.user) return;
    const editor = vscode.window.activeTextEditor;
    const folder = editor && vscode.workspace.getWorkspaceFolder(editor.document.uri);
    const config = settings();
    const activity = activityFor(editor, folder?.name, {
      showFileName: config.get('showFileName', true),
      showProjectName: config.get('showProjectName', false),
    });
    activity.startTimestamp = startedAt;
    const key = JSON.stringify(activity);
    if (key === lastActivity) return;
    try {
      await current.user.setActivity(activity);
      if (client === current) lastActivity = key;
    } catch (error) {
      output.appendLine(`Could not update presence: ${error}`);
      if (client === current) {
        await retire();
        retry();
      }
    }
  }

  async function connect() {
    const id = appId();
    if (stopped || paused || client || !/^\d{17,20}$/.test(id)) return;
    const next = new Client({ clientId: id });
    client = next;
    showStatus('connecting');
    next.on('disconnected', () => {
      if (client !== next) return;
      void retire().then(retry);
    });
    try {
      await next.login();
      if (client === next && !stopped && !paused) {
        showStatus('connected');
        await update();
      }
    } catch (error) {
      output.appendLine(`Could not connect to Discord: ${error}`);
      if (client === next) {
        await retire();
        retry();
      }
    }
  }

  function cancelRetry() {
    clearTimeout(retryTimer);
    retryTimer = undefined;
  }

  async function restart() {
    const currentRevision = ++revision;
    cancelRetry();
    await retire(true);
    if (revision === currentRevision) await connect();
  }

  context.subscriptions.push(vscode.commands.registerCommand('discordCodingPresence.connect', async () => {
    if (stopped || manualConnect) return;
    if (!/^\d{17,20}$/.test(appId())) {
      void vscode.window.showErrorMessage('Set a valid Discord application ID (17–20 digits) in Discord Coding Presence settings.');
      return;
    }
    paused = false;
    const operation = restart();
    manualConnect = operation;
    try { await operation; } finally {
      if (manualConnect === operation) manualConnect = undefined;
    }
  }));
  context.subscriptions.push(vscode.commands.registerCommand('discordCodingPresence.disconnect', async () => {
    paused = true;
    ++revision;
    manualConnect = undefined;
    cancelRetry();
    clearTimeout(updateTimer);
    await retire(true);
  }));

  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(() => { updateTimer = undefined; void update(); }, 250);
  }));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
    if (stopped || paused || !event.affectsConfiguration('discordCodingPresence')) return;
    const id = appId();
    if (client && client.clientId !== id) {
      void restart();
    } else if (!client) {
      void connect();
    } else {
      void update();
    }
  }));

  shutdown = async () => {
    stopped = true;
    ++revision;
    cancelRetry();
    clearTimeout(updateTimer);
    await retire(true);
  };
  void connect();
}

async function deactivate() {
  if (shutdown) await shutdown();
}

module.exports = { activate, deactivate };
