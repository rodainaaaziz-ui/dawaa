require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
const CHAT_SHARED_SECRET = process.env.CHAT_SHARED_SECRET;
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 30000);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",").map(v => v.trim()).filter(Boolean);

if (!N8N_WEBHOOK_URL || !CHAT_SHARED_SECRET) {
  console.error("Missing required N8N_WEBHOOK_URL or CHAT_SHARED_SECRET.");
  process.exit(1);
}
let webhook;
try {
  webhook = new URL(N8N_WEBHOOK_URL);
  if (!["https:", "http:"].includes(webhook.protocol)) throw new Error("Invalid protocol");
} catch {
  console.error("N8N_WEBHOOK_URL must be a valid HTTP(S) URL.");
  process.exit(1);
}

app.disable("x-powered-by");
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS || 1));
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed by CORS"));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
  maxAge: 600
}));
app.use(express.json({ limit: "16kb", strict: true }));

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.CHAT_RATE_LIMIT_PER_MINUTE || 12),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many messages. Please wait a moment and try again." }
});

app.get("/api/health", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ status: "ok", service: "dawaa-api", timestamp: new Date().toISOString() });
});

app.post("/api/chat", chatLimiter, async (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId.slice(0, 100) : "";
  if (!message) return res.status(400).json({ error: "Please enter a message." });
  if (message.length > 1200) return res.status(413).json({ error: "Message is too long. Maximum length is 1,200 characters." });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const upstream = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "x-dawaa-chat-key": CHAT_SHARED_SECRET
      },
      body: JSON.stringify({ message, sessionId, source: "dawaa-website", locale: "auto" }),
      signal: controller.signal
    });
    const raw = await upstream.text();
    if (!upstream.ok) {
      console.error(`n8n upstream returned HTTP ${upstream.status}`);
      return res.status(502).json({ error: "The pharmacy automation is temporarily unavailable. Please try again." });
    }
    let payload;
    try { payload = JSON.parse(raw); }
    catch { payload = { reply: raw }; }
    const candidate = payload.reply ?? payload.output ?? payload.text ?? payload.message;
    if (typeof candidate !== "string" || !candidate.trim()) {
      console.error("n8n returned an unexpected response shape.");
      return res.status(502).json({ error: "The pharmacy automation returned an unreadable response." });
    }
    res.set("Cache-Control", "no-store");
    return res.json({ reply: candidate.trim() });
  } catch (error) {
    const timeout = error.name === "AbortError";
    console.error(timeout ? "n8n request timed out." : "n8n connection failed.");
    return res.status(timeout ? 504 : 502).json({
      error: timeout ? "The pharmacy automation took too long to respond." : "Could not connect to the pharmacy automation."
    });
  } finally {
    clearTimeout(timer);
  }
});

app.use((err, _req, res, _next) => {
  if (err.message === "Origin not allowed by CORS") return res.status(403).json({ error: "This website origin is not allowed." });
  if (err instanceof SyntaxError) return res.status(400).json({ error: "Invalid JSON request." });
  console.error("API request error:", err.message);
  return res.status(500).json({ error: "Unexpected server error." });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Dawaa API listening on port ${PORT}`);
});
