# Windows setup

## Requirements

Windows, Microsoft Edge or Google Chrome, and Windows Script Host for the double-click launcher. Use a writable local folder.

## Start

The repository includes the existing Windows Node runtime in `runtime/node.exe` and its license notice. Double-click `START-H5P.vbs`. To create a desktop shortcut, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\CREATE-DESKTOP-SHORTCUT.ps1
```

Recreate the shortcut after moving the folder. It points to this checkout, not a global installation.

For terminal diagnostics:

```powershell
.\runtime\node.exe launch.mjs --no-browser
```

If the runtime is missing, install Node.js 22+ from the official Node.js distribution and run `node launch.mjs`. For the VBS launcher, restore the Windows `node.exe` into `runtime/` with the corresponding Node license.

## Library and shutdown

Drop lessons into the window or use Choose H5P files. Imports copy sources; duplicate names get suffixes. The import limit is 100 MB per file. Use Export results before changing lessons. Use Quit viewer to stop the server; closing all desktop viewer windows normally stops it after approximately two idle minutes. `--no-browser` disables that idle shutdown.

## Troubleshooting

- Blank player: confirm the package includes libraries, then inspect the browser console.
- Missing lessons: add `.h5p` files to this checkout's `packages/` folder and refresh the package list.
- Port or stale page: use the URL from the current launch; old package URLs can expire when switching lessons.
- No scores: answer a scored interaction. Not every H5P activity emits scored xAPI events.
- Keep the whole checkout together: player assets are needed at runtime.

## Remove a lesson

Use Remove beside a library lesson to move it into the local `trash/` folder. Removing the active lesson unloads it and clears its session results. To restore it, move the file from `trash/` back to `packages/` and remove the timestamp and UUID prefix from its filename. Trash is excluded from Git.
