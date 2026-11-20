# ULTRON

An installable AI assistant app (PWA): chat, voice, photos and videos, hands-free "Hey ULTRON", and one-tap phone actions.
Powered by Google's Gemini free tier. Red-and-black theme.

## Features
Chat with streaming replies, voice messages, photos and videos, spoken replies, hands-free "Hey ULTRON", one-tap phone actions, four personalities (Villain, Plain, Coder, Teacher), memory ("remember that ..."), past chats, regenerate, text size, share-to-ULTRON and launcher shortcuts.

## Files
`server.js` (the server), `index.html` (the app), `sw.js` (offline cache), `manifest.webmanifest`, `face.jpg`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `package.json`.
Keep all files in one folder (no subfolders).

## Deploy (Render, free)
1. Put every file in a GitHub repository.
2. Render > New > Web Service > pick the repository. Start Command: `node server.js`. Instance type: Free.
3. Environment variables:
   - `GEMINI_API_KEY`: free key from aistudio.google.com (required)
   - `APP_TOKEN`: your secret access code (strongly recommended)
   - `TTS_VOICE` (optional): Algenib, Gacrux, Charon, Orus or Alnilam
   - `GEMINI_MODEL`, `TTS_MODEL` (optional): override the model lists
4. Open the Render address in Chrome > menu > Install app.

## Update
Upload the changed files to GitHub. Render redeploys by itself (about a minute).
Open ULTRON; if you see "A new version is ready", tap Update. Otherwise open it twice.

## Good to know
- The free Gemini plan has daily and per-minute limits, and the studio voice has very small ones. ULTRON falls back to your phone's voice.
- Hands-free works only while the app is open and the screen is on.
- Anything you attach or say is sent to Google's Gemini.
