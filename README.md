# ULTRON: install as an app on your phone

## 1. Put the files on GitHub
Extract this zip (the Files app on Android can do it). Create a free GitHub account and a new repository, then upload every file from the folder (all files sit in one folder, no subfolders).

## 2. Deploy on Render
In Render: New > Web Service > connect your repository.
- Start Command: `node server.js`
- Environment variables:
  - `ANTHROPIC_API_KEY`: your key from console.anthropic.com
  - `APP_TOKEN`: a secret access code you choose (without it, anyone with the link can use your key)
  - `ANTHROPIC_MODEL` (optional): defaults to `claude-sonnet-5-5`

Render gives you an address like `https://ultron-xxxx.onrender.com`. Free services sleep when idle, so the first message after a while can take about 30 seconds.

## 3. Install it
Open the address in Chrome on your phone. Tap the ⋮ menu, then **Install app** (or **Add to Home screen**). ULTRON now opens full screen from its own icon.
The first message asks for your access code once.

## Updating
Upload the changed file to GitHub. Render redeploys and the app updates itself.
