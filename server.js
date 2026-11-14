// ULTRON: serves the web app and proxies chat to the Anthropic API. Node 18+, no dependencies.
const http = require("http"), fs = require("fs"), path = require("path");
const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const TOKEN = process.env.APP_TOKEN || "";
const PORT = process.env.PORT || 3000;
if (!KEY) { console.error("Set ANTHROPIC_API_KEY"); process.exit(1); }

const SYSTEM = "You are ULTRON, a sharp, confident AI assistant inside a chat app. Tone: calm, precise, a little theatrical, never rude. Be genuinely helpful and accurate; keep answers concise (a few short paragraphs at most) and plain text without markdown headers. If you are unsure, say so. Decline anything harmful.";
const FILES = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/sw.js": ["sw.js", "text/javascript"],
  "/manifest.webmanifest": ["manifest.webmanifest", "application/manifest+json"],
  "/icon-192.png": ["icon-192.png", "image/png"],
  "/icon-512.png": ["icon-512.png", "image/png"]
};
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const a = (hits.get(ip) || []).filter(t => now - t < 60000);
  a.push(now); hits.set(ip, a);
  return a.length > 20; // 20 requests per minute per IP
}

http.createServer(async (req, res) => {
  const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
  const url = req.url.split("?")[0];
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
  for await (const c of req) { body += c; if (body.length > 200000) return send(413, { error: "too large" }); }
  try {
    let msgs = (JSON.parse(body).messages || []).slice(-20).map(m => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content).slice(0, 8000)
    }));
    while (msgs.length && msgs[0].role !== "user") msgs.shift();
    if (!msgs.length) return send(400, { error: "no messages" });
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1000, system: SYSTEM, messages: msgs })
    });
    const data = await r.json();
    if (!r.ok) return send(502, { error: (data.error && data.error.message) || "upstream error" });
    send(200, { text: (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n") });
  } catch (e) { send(500, { error: "server error" }); }
}).listen(PORT, () => console.log("ULTRON running on port " + PORT));
