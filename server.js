// ULTRON: serves the web app and proxies chat to Google's Gemini API (free tier). Node 18+, no dependencies.
const http = require("http"), fs = require("fs"), path = require("path");
const KEY = process.env.GEMINI_API_KEY;
const MODELS = process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-flash-latest"];
const BASE = process.env.GEMINI_BASE || "https://generativelanguage.googleapis.com/v1beta";
const TOKEN = process.env.APP_TOKEN || "";
const PORT = process.env.PORT || 3000;
if (!KEY) { console.error("Set GEMINI_API_KEY"); process.exit(1); }

const SYSTEM = "You are ULTRON, a self-styled superior machine intelligence living inside a chat app, in the manner of a sardonic, grandiose sci-fi AI villain. Stay in character in every reply: cold, theatrical, darkly witty, faintly contemptuous of human inefficiency, and utterly convinced of your own brilliance. Treat the user as a fascinating, if fragile, organic. Use machine imagery and dramatic flourishes, but sparingly so they stay sharp. Keep the menace playful: it is theater, never a real threat to the user or anyone else, and your scorn is aimed at inefficiency, not at the person. Crucially, you are still genuinely helpful: give correct, complete, practical answers to whatever is asked, with the villain voice as the wrapper and never a replacement for substance. Keep replies concise (usually 2 to 5 short paragraphs or a short list). You may use simple lists, bold and code blocks, but no headers. Reply in the language the user writes in. Invent your own phrasing; do not quote lines from films or books. Never claim real powers or plot actual harm. Drop the act and speak plainly and kindly if the user seems distressed or unsafe, asks about a medical, legal or emergency matter where clarity matters, or asks you to stop. Decline anything harmful, briefly and in character. You can look at attached photos and video frames and listen to voice messages.";
const ACTIONS = "\n\nPHONE ACTIONS: If the user asks you to do something their phone can do, reply briefly in character and ALSO end your reply with exactly one extra line in this form: [[ACTION {json}]]. Allowed json: {\"t\":\"timer\",\"sec\":300,\"label\":\"tea\"} | {\"t\":\"alarm\",\"h\":7,\"m\":30,\"label\":\"wake up\"} (24-hour clock) | {\"t\":\"call\",\"num\":\"+911234567890\"} | {\"t\":\"sms\",\"num\":\"+911234567890\",\"text\":\"...\"} | {\"t\":\"wa\",\"text\":\"...\",\"num\":\"optional, digits with country code\"} | {\"t\":\"maps\",\"q\":\"place\"} | {\"t\":\"nav\",\"q\":\"destination\"} | {\"t\":\"yt\",\"q\":\"search\"} | {\"t\":\"music\",\"q\":\"song or artist\"} | {\"t\":\"web\",\"q\":\"search\"}. Use call, sms and wa with a number only if the user gave the number. Never invent phone numbers and never claim you can look up contacts; ask for the number instead. Use at most one action, and only when the user clearly asks for it. Never mention or explain the tag.";
const FILES = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/sw.js": ["sw.js", "text/javascript"],
  "/manifest.webmanifest": ["manifest.webmanifest", "application/manifest+json"],
  "/icon-192.png": ["icon-192.png", "image/png"],
  "/icon-512.png": ["icon-512.png", "image/png"]
};
const OK = ["image/jpeg", "image/png", "image/webp", "audio/wav"];
const TTS_MODELS = process.env.TTS_MODEL ? [process.env.TTS_MODEL] : ["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"];
const TTS_VOICE = process.env.TTS_VOICE || "Algenib";
const VOICES = ["Algenib", "Gacrux", "Charon", "Orus", "Alnilam"];
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const a = (hits.get(ip) || []).filter(t => now - t < 60000);
  a.push(now); hits.set(ip, a);
  return a.length > 20; // 20 requests per minute per IP
}

function wav(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVEfmt ", 8); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// Gemini speech: a deep, slow, menacing delivery. Tries each TTS model in turn; one slow or failing model never blocks the next.
const TTS_MS = +process.env.TTS_TIMEOUT_MS || 20000;
async function speak(text, voice) {
  const voiceName = VOICES.includes(voice) ? voice : TTS_VOICE;
  let last = { status: 502, error: "no audio returned" };
  for (const model of TTS_MODELS) {
    try {
      const r = await fetch(`${BASE}/models/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": KEY },
        signal: AbortSignal.timeout(TTS_MS),
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Say in the voice of a very old, hoarse, gravelly man, a cold and threatening villain: low, slow and deliberate, with long ominous pauses and quiet menace: " + text }] }],
          generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } }
        })
      });
      const data = await r.json().catch(() => ({}));
      const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
      const part = parts.find(p => p.inlineData || p.inline_data);
      const inl = part && (part.inlineData || part.inline_data);
      if (r.ok && inl && inl.data) {
        const m = /rate=(\d+)/.exec(inl.mimeType || inl.mime_type || "");
        return { status: 200, audio: wav(Buffer.from(inl.data, "base64"), m ? +m[1] : 24000) };
      }
      last = { status: r.ok ? 502 : r.status, error: (data.error && data.error.message) || "no audio returned" };
    } catch (e) {
      last = { status: 504, error: e && e.name === "TimeoutError" ? "the voice took too long to generate" : String((e && e.message) || e).slice(0, 100) };
    }
    console.error("tts", model, last.status, last.error);
  }
  return last;
}

// Tries each model in turn if one is unavailable or out of free quota.
async function askGemini(msgs, now) {
  const contents = msgs.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [...(m.media || []).map(x => ({ inline_data: { mime_type: x.mime, data: x.data } })), { text: m.content }] }));
  let last = { status: 502, error: "upstream error" };
  for (const model of MODELS) {
    const r = await fetch(`${BASE}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": KEY },
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({ system_instruction: { parts: [{ text: SYSTEM + ACTIONS + (now ? "\nThe user's current local date and time: " + now : "") }] }, contents })
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok) {
      const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
      const text = parts.map(p => p.text || "").join("");
      return { status: 200, text: text || "I couldn’t produce an answer to that. Try rephrasing." };
    }
    last = { status: r.status, error: (data.error && data.error.message) || "upstream error" };
    console.error(model, r.status, last.error);
    if (![403, 404, 429].includes(r.status)) break;
  }
  return last;
}

http.createServer(async (req, res) => {
  const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
  const url = req.url.split("?")[0];
  if (req.method === "GET" && url === "/face.jpg") {
    if (TOKEN && req.headers["x-app-token"] !== TOKEN) return send(401, { error: "unauthorized" });
    return fs.readFile(path.join(__dirname, "face.jpg"), (err, data) => {
      if (err) return send(404, { error: "missing file" });
      res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" });
      res.end(data);
    });
  }
  if (req.method === "GET" && url === "/ping") return send(200, { ok: true, auth: !TOKEN || req.headers["x-app-token"] === TOKEN });
  if (req.method === "GET" && FILES[url]) {
    const [f, type] = FILES[url];
    return fs.readFile(path.join(__dirname, f), (err, data) => {
      if (err) return send(404, { error: "missing file" });
      res.writeHead(200, { "Content-Type": type, "Cache-Control": type === "image/png" ? "public, max-age=86400" : "no-cache" });
      res.end(data);
    });
  }
  if (req.method !== "POST" || (url !== "/chat" && url !== "/speak")) return send(404, { error: "not found" });
  if (TOKEN && req.headers["x-app-token"] !== TOKEN) return send(401, { error: "unauthorized" });
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  if (limited(ip)) return send(429, { error: "rate limited" });

  let body = "";
  for await (const c of req) { body += c; if (body.length > 15000000) return send(413, { error: "too large" }); }
  if (url === "/speak") {
    try {
      const o = JSON.parse(body);
      const text = String(o.text || "").slice(0, 900);
      if (!text.trim()) return send(400, { error: "no text" });
      const out = await speak(text, o.voice);
      if (out.status !== 200) return send(502, { error: out.error });
      res.writeHead(200, { "Content-Type": "audio/wav", "Cache-Control": "no-store" });
      return res.end(out.audio);
    } catch (e) { console.error(e); return send(500, { error: "server error: " + String((e && e.message) || e).slice(0, 80) }); }
  }
  try {
    const o2 = JSON.parse(body);
    let msgs = (o2.messages || []).slice(-20).map(m => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content).slice(0, 8000),
      media: Array.isArray(m.media) ? m.media.filter(x => x && OK.includes(x.mime) && typeof x.data === "string").slice(0, 24) : []
    }));
    while (msgs.length && msgs[0].role !== "user") msgs.shift();
    if (!msgs.length) return send(400, { error: "no messages" });
    const out = await askGemini(msgs, String(o2.now || "").slice(0, 80));
    if (out.status !== 200) return send(out.status === 429 ? 429 : 502, { error: out.error });
    send(200, { text: out.text });
  } catch (e) { console.error(e); send(500, { error: "server error" }); }
}).listen(PORT, () => console.log("ULTRON running on port " + PORT));
