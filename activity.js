const path = require('node:path');

const clean = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 128);
const icons = {
  javascript: ['javascript', 'JavaScript'], javascriptreact: ['javascript', 'JavaScript'],
  typescript: ['typescript', 'TypeScript'], typescriptreact: ['typescript', 'TypeScript'],
  python: ['python', 'Python'], java: ['java', 'Java'],
  c: ['c', 'C'], cpp: ['cpp', 'C++'], csharp: ['csharp', 'C#'],
  go: ['go', 'Go'], rust: ['rust', 'Rust'], php: ['php', 'PHP'], ruby: ['ruby', 'Ruby'],
  html: ['html', 'HTML'], css: ['css', 'CSS'],
  json: ['json', 'JSON'], jsonc: ['json', 'JSON'],
  markdown: ['markdown', 'Markdown'], shellscript: ['shell', 'Shell'],
};
const idleImage = { largeImageKey: 'coding', largeImageText: 'VS Code' };

function activityFor(editor, workspaceName, { showFileName = true, showProjectName = false } = {}) {
  if (!editor) return { details: 'Working in VS Code', ...idleImage };

  const language = clean(editor.document.languageId) || 'a file';
  const [largeImageKey, largeImageText] = icons[editor.document.languageId] || ['code', language];
  const file = clean(path.posix.basename(editor.document.uri.path));
  const project = clean(workspaceName);
  const details = showFileName && file ? clean(`Editing ${file}`) : clean(`Working in ${largeImageText}`);
  const state = [largeImageText, showProjectName && project].filter(Boolean).join(' · ');

  return {
    details,
    state: clean(state),
    largeImageKey,
    largeImageText,
    ...(largeImageKey !== 'code' ? { smallImageKey: 'code', smallImageText: 'VS Code' } : {}),
  };
}

module.exports = { activityFor };
