# Discord Coding Presence

Show the language icon and file name of your active VS Code editor in your Discord activity. The workspace name is optional and hidden by default.

## Setup

1. Keep the Discord desktop app running. The extension connects using its included application ID and reconnects if Discord starts later.
2. In the [Discord Developer Portal](https://discord.com/developers/applications/1562163004550946826), open this application's **Rich Presence → Art Assets** and upload the PNGs from `assets/icons/`. Use each filename without `.png` as its asset key (for example, `javascript.png` must have the key `javascript`), then click **Save Changes** if shown. Discord cannot read images directly from the installed VSIX.
3. In Discord, enable **User Settings → Activity Privacy → Share my activity** if your activity is hidden.
4. Focus a code editor tab in VS Code. When no text editor is active, the activity says **Working in VS Code**.
5. The active file name is public by default. To hide it, disable **Show File Name** in VS Code settings. Enable **Show Project Name** there if you also want to share the workspace folder name. Full paths are never shown.

The activity uses a large language icon and a small VS Code icon. Supported icons: JavaScript, TypeScript, Python, Java, C, C++, C#, Go, Rust, PHP, Ruby, HTML, CSS, JSON, Markdown, and shell scripts. Other languages use a generic code icon.

When you switch files, the Discord activity updates after 250 milliseconds. Rapid switches are combined into one update. The elapsed timer starts when the extension activates and continues across file changes and Discord reconnects; reloading the VS Code window restarts it.

If Discord shows the application's default icon, refresh the Art Assets page to confirm the images were saved. In **Rich Presence → Visualizer**, set the large image key to `javascript` and the small image key to `code`. Both images should appear there before testing the extension. New assets may take several minutes to become available. Once they appear, fully restart Discord and refocus the code editor in VS Code.

This extension uses local Discord RPC. It runs in desktop VS Code, including when your workspace is remote. It does not work in browser-only VS Code.

## Connection controls

Click **Discord: Connect** or **Discord: Disconnect** in the VS Code status bar. While connecting, click **Discord: Connecting…** to cancel. Both commands are also available in the Command Palette as **Discord Coding Presence: Connect** and **Discord Coding Presence: Disconnect**.

Connect starts a fresh connection immediately, so you can recover presence without restarting VS Code. Disconnect clears your activity and pauses automatic retries until you click Connect or restart VS Code. Automatic reconnects otherwise continue every 15 seconds. The elapsed timer continues across manual reconnects.

## Development

Run `npm install` and `npm run build`, then press **F5** in VS Code to open an Extension Development Host. Run `npm test` for the activity check.

## Publishing

The language assets are large images; `code` is the small VS Code overlay, and `coding` is shown when no text editor is active. Asset keys belong to one Discord application, so users of a different Application ID must upload the same assets to their own app.

Run `npm run package` to create a VSIX. To publish it, upload the VSIX under the publisher ID in `package.json` on the [Marketplace publisher page](https://marketplace.visualstudio.com/manage/publishers/).

Language icon sources are from [Devicon v2.17.0](https://github.com/devicons/devicon/tree/v2.17.0), under its MIT license; product logos remain trademarks of their respective owners. The `coding` and `code` artwork is original to this extension.
