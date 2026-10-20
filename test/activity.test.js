const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { activityFor } = require('../activity');

test('active filename and language are shown without revealing the path', () => {
  const editor = { document: { languageId: 'javascript', uri: { path: '/secret/work/api.js' } } };
  assert.deepEqual(activityFor(editor, 'Secret Project', {}), {
    details: 'Editing api.js', state: 'JavaScript',
    largeImageKey: 'javascript', largeImageText: 'JavaScript',
    smallImageKey: 'code', smallImageText: 'VS Code',
  });
  assert.deepEqual(activityFor(editor, 'Secret Project', { showFileName: true, showProjectName: true }), {
    details: 'Editing api.js',
    state: 'JavaScript · Secret Project',
    largeImageKey: 'javascript', largeImageText: 'JavaScript',
    smallImageKey: 'code', smallImageText: 'VS Code',
  });
  assert.deepEqual(activityFor(editor, 'Secret Project', { showFileName: false }), {
    details: 'Working in JavaScript', state: 'JavaScript',
    largeImageKey: 'javascript', largeImageText: 'JavaScript',
    smallImageKey: 'code', smallImageText: 'VS Code',
  });
  assert.deepEqual(activityFor(undefined, undefined, {}), {
    details: 'Working in VS Code',
    largeImageKey: 'coding', largeImageText: 'VS Code',
  });
});

test('language aliases and unsupported languages use the right icon', () => {
  const editor = id => ({ document: { languageId: id, uri: { path: '/work/file' } } });
  assert.equal(activityFor(editor('typescriptreact'), '', {}).largeImageKey, 'typescript');
  assert.equal(activityFor(editor('jsonc'), '', {}).largeImageKey, 'json');
  assert.equal(activityFor(editor('shellscript'), '', {}).largeImageKey, 'shell');
  assert.deepEqual(activityFor(editor('unknown'), '', {}), {
    details: 'Editing file', state: 'unknown',
    largeImageKey: 'code', largeImageText: 'unknown',
  });
});

test('every supported language has an upload-ready icon', () => {
  const languages = ['javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'php', 'ruby', 'html', 'css', 'json', 'markdown', 'shellscript'];
  for (const languageId of languages) {
    const editor = { document: { languageId, uri: { path: '/work/file' } } };
    const key = activityFor(editor, '', {}).largeImageKey;
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'assets', 'icons', `${key}.png`)), key);
  }
});
