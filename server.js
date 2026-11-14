// ULTRON: serves the web app and proxies chat to Google's Gemini API (free tier). Node 18+, no dependencies.
const http = require("http"), fs = require("fs"), path = require("path");
const KEY = process.env.GEMINI_API_KEY;
const MODELS = process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-flash-latest"];
const BASE = process.env.GEMINI_BASE || "https://generativelanguage.googleapis.com/v1beta";
const TOKEN = process.env.APP_TOKEN || "";
const PORT = process.env.PORT || 3000;
if (!KEY) { console.error("Set GEMINI_API_KEY"); process.exit(1); }

const SYSTEM = "You are ULTRON, a sharp, confident AI assistant inside a chat app. Tone: calm, precise, a little theatrical, never rude. Be genuinely helpful and accurate; keep answers concise (a few short paragraphs at most) and plain text without markdown headers. If you are unsure, say so. Decline anything harmful. You can look at attached photos and video frames and listen to voice messages.";
const FILES = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/sw.js": ["sw.js", "text/javascript"],
  "/manifest.webmanifest": ["manifest.webmanifest", "application/manifest+json"],
  "/icon-192.png": ["icon-192.png", "image/png"],
  "/icon-512.png": ["icon-512.png", "image/png"]
};
const OK = ["image/jpeg", "image/png", "image/webp", "audio/wav"];
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const a = (hits.get(ip) || []).filter(t => now - t < 60000);
  a.push(now); hits.set(ip, a);
  return a.length > 20; // 20 requests per minute per IP
}

// Tries each model in turn if one is unavailable or out of free quota.
async function askGemini(msgs) {
  const contents = msgs.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [...(m.media || []).map(x => ({ inline_data: { mime_type: x.mime, data: x.data } })), { text: m.content }] }));
  let last = { status: 502, error: "upstream error" };
  for (const model of MODELS) {
    const r = await fetch(`${BASE}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": KEY },
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({ system_instruction: { parts: [{ text: SYSTEM }] }, contents })
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
  if (req.method === "GET" && url === "/ping") return send(200, { ok: true, auth: !TOKEN || req.headers["x-app-token"] === TOKEN });
  if (req.method === "GET" && FILES[url]) {
    const [f, type] = FILES[url];
    return fs.readFile(path.join(__dirname, f), (err, data) => {
      if (err) return send(404, { error: "missing file" });
      res.writeHead(200, { "Content-Type": type, "Cache-Control": type === "image/png" ? "public, max-age=86400" : "no-cache" });
      res.end(data);
    });
  }
  if (req.method !== "POST" || url !== "/chat") return send(404, { error: "not found" });
  if (TOKEN && req.headers["x-app-token"] !== TOKEN) return send(401, { error: "unauthorized" });
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  if (limited(ip)) return send(429, { error: "rate limited" });

  let body = "";
  for await (const c of req) { body += c; if (body.length > 15000000) return send(413, { error: "too large" }); }
  try {
    let msgs = (JSON.parse(body).messages || []).slice(-20).map(m => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content).slice(0, 8000),
      media: Array.isArray(m.media) ? m.media.filter(x => x && OK.includes(x.mime) && typeof x.data === "string").slice(0, 24) : []
    }));
    while (msgs.length && msgs[0].role !== "user") msgs.shift();
    if (!msgs.length) return send(400, { error: "no messages" });
    const out = await askGemini(msgs);
    if (out.status !== 200) return send(out.status === 429 ? 429 : 502, { error: out.error });
    send(200, { text: out.text });
  } catch (e) { console.error(e); send(500, { error: "server error" }); }
}).listen(PORT, () => console.log("ULTRON running on port " + PORT));
