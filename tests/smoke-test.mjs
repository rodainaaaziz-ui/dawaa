const base = process.env.DAWAA_API_BASE_URL;
if (!base) throw new Error("Set DAWAA_API_BASE_URL to the deployed API origin.");
const health = await fetch(`${base.replace(/\/+$/, "")}/api/health`);
if (!health.ok) throw new Error(`Health check failed: HTTP ${health.status}`);
const h = await health.json();
if (h.status !== "ok") throw new Error("Unexpected health response.");
console.log("API health check passed.");
console.log("Chat test intentionally requires a real n8n webhook and is not auto-sent by this smoke test.");
