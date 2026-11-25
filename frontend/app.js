(() => {
  const config = window.DAWAA_CONFIG || {};
  const apiBase = String(config.API_BASE_URL || "").replace(/\/+$/, "");
  const messages = document.getElementById("chatMessages");
  const form = document.getElementById("chatForm");
  const input = document.getElementById("chatInput");
  const sendButton = document.getElementById("sendButton");
  const toast = document.getElementById("toast");
  const suggestions = document.getElementById("suggestions");
  let busy = false;
  const sessionId = (crypto.randomUUID ? crypto.randomUUID() : `session-${Date.now()}-${Math.random().toString(16).slice(2)}`);

  document.getElementById("year").textContent = new Date().getFullYear();
  const nav = document.getElementById("mainNav");
  const menuToggle = document.getElementById("menuToggle");
  menuToggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded", String(open));
  });
  nav.querySelectorAll("a").forEach(a => a.addEventListener("click", () => nav.classList.remove("open")));

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    window.setTimeout(() => toast.classList.remove("show"), 2600);
  }
  function addMessage(role, text, label) {
    const row = document.createElement("div");
    row.className = `message ${role === "user" ? "user-message" : "assistant-message"}`;
    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = role === "user" ? "●" : "✚";
    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    const p = document.createElement("p");
    p.textContent = text;
    const time = document.createElement("span");
    time.className = "message-time";
    time.textContent = label || (role === "user" ? "YOU" : "DAWAA ASSISTANT");
    bubble.append(p, time);
    row.append(avatar, bubble);
    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;
    return row;
  }
  function setGateway(ok, text) {
    const chip = document.getElementById("gatewayStatus");
    chip.classList.toggle("online", ok);
    chip.classList.toggle("offline", !ok);
    chip.innerHTML = `<i></i> ${ok ? "API available" : "API unavailable"}`;
    document.getElementById("gatewayTitle").textContent = ok ? "API gateway reachable" : "API gateway unavailable";
    document.getElementById("gatewayText").textContent = text;
    document.getElementById("gatewayChecked").textContent = `Checked ${new Date().toLocaleTimeString()}`;
    document.getElementById("chatConnectionLabel").textContent = ok ? "Gateway reachable" : "Service unavailable";
  }
  async function checkHealth() {
    if (!apiBase) {
      setGateway(false, "The public API address has not been configured for this deployment.");
      document.getElementById("chatConnectionLabel").textContent = "Setup required";
      return;
    }
    try {
      const response = await fetch(`${apiBase}/api/health`, { method: "GET", headers: { "Accept": "application/json" } });
      if (!response.ok) throw new Error("Health check failed");
      const data = await response.json();
      setGateway(data.status === "ok", data.status === "ok" ? "The Dawaa API gateway is responding." : "The API gateway reported an issue.");
    } catch {
      setGateway(false, "Could not reach the API gateway. Please try again later.");
    }
  }
  async function sendMessage(message) {
    if (busy) return;
    if (!apiBase) {
      showToast("The Dawaa chat service has not been configured yet.");
      addMessage("assistant", "The chat service is not connected yet. The website administrator must finish the secure API deployment first.");
      return;
    }
    busy = true;
    sendButton.disabled = true;
    input.disabled = true;
    suggestions.hidden = true;
    const typing = addMessage("assistant", "Connecting to the pharmacy automation…", "SENDING");
    typing.classList.add("typing");
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 35000);
      let response;
      try {
        response = await fetch(`${apiBase}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({ message, sessionId }),
          signal: controller.signal
        });
      } finally {
        window.clearTimeout(timeout);
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "The pharmacy assistant could not respond.");
      if (typeof data.reply !== "string" || !data.reply.trim()) throw new Error("The automation returned an empty response.");
      typing.remove();
      addMessage("assistant", data.reply, "LIVE AUTOMATION RESPONSE");
    } catch (error) {
      typing.remove();
      const text = error.name === "AbortError"
        ? "The request timed out. Please try again."
        : (error.message || "The pharmacy assistant is temporarily unavailable.");
      addMessage("assistant", text, "CONNECTION NOTICE");
      showToast("Message could not be completed.");
    } finally {
      busy = false;
      sendButton.disabled = false;
      input.disabled = false;
      input.focus();
    }
  }
  form.addEventListener("submit", event => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message) return;
    addMessage("user", message);
    input.value = "";
    sendMessage(message);
  });
  suggestions.querySelectorAll("button").forEach(button => {
    button.addEventListener("click", () => {
      const message = button.dataset.prompt || "";
      if (!message) return;
      addMessage("user", message);
      sendMessage(message);
    });
  });
  document.getElementById("clearChat").addEventListener("click", () => {
    messages.innerHTML = "";
    addMessage("assistant", "Welcome back to Dawaa. What would you like to know?");
    suggestions.hidden = false;
  });
  checkHealth();
})();
