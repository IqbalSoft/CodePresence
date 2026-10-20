const vscode = require('vscode');
const { Client } = require('@xhayper/discord-rpc');
const { activityFor } = require('./activity');

let shutdown;

function activate(context) {
  const output = vscode.window.createOutputChannel('Discord Coding Presence');
  context.subscriptions.push(output);
  const startedAt = Date.now();
  let client;
  let retryTimer;
  let updateTimer;
  let lastActivity;
  let stopped = false;

  const settings = () => vscode.workspace.getConfiguration('discordCodingPresence');
  const appId = () => settings().get('applicationId', '').trim();

  async function retire(clear = false) {
    const old = client;
    client = undefined;
    lastActivity = undefined;
    if (!old) return;
    old.removeAllListeners();
    if (clear && old.user) {
      try { await old.user.clearActivity(); } catch (_) { /* Discord may already be closed. */ }
    }
    await old.destroy();
  }

  function retry() {
    if (!stopped && !retryTimer && /^\d{17,20}$/.test(appId())) {
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        void connect();
      }, 15000);
    }
  }

  async function update() {
    if (!client?.user) return;
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
      await client.user.setActivity(activity);
      lastActivity = key;
    } catch (error) {
      output.appendLine(`Could not update presence: ${error}`);
      await retire();
      retry();
    }
  }

  async function connect() {
    const id = appId();
    if (stopped || client || !/^\d{17,20}$/.test(id)) return;
    const next = new Client({ clientId: id });
    client = next;
    next.on('disconnected', () => {
      if (client !== next) return;
      void retire().then(retry);
    });
    try {
      await next.login();
      if (client === next && !stopped) await update();
    } catch (error) {
      output.appendLine(`Could not connect to Discord: ${error}`);
      if (client === next) {
        await retire();
        retry();
      }
    }
  }

  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(() => { updateTimer = undefined; void update(); }, 250);
  }));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
    if (!event.affectsConfiguration('discordCodingPresence')) return;
    const id = appId();
    if (client && client.clientId !== id) {
      void retire(true).then(connect);
    } else if (!client) {
      void connect();
    } else {
      void update();
    }
  }));

  shutdown = async () => {
    stopped = true;
    clearTimeout(retryTimer);
    clearTimeout(updateTimer);
    await retire(true);
  };
  void connect();
}

async function deactivate() {
  if (shutdown) await shutdown();
}

module.exports = { activate, deactivate };
