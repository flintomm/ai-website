(function siteAssistantBootstrap() {
  window.__FLINT_SITE_ASSISTANT_ACTIVE = true;

  const STORAGE = {
    unlocked: "site_assistant_unlocked_v1",
    email: "site_assistant_email_v1",
    sessionId: "site_assistant_session_id_v1",
    messages: "site_assistant_messages_v1",
    apiBase: "site_assistant_api_base_v1"
  };

  const SESSION = {
    revealPlayed: "site_assistant_reveal_played_v1"
  };

  const config = window.SITE_ASSISTANT_CONFIG || {};
  const defaultApiBase = (function resolveDefaultApiBase() {
    const host = String(window.location.hostname || "").toLowerCase();
    if (host === "tphch.com" || host.endsWith(".tphch.com")) {
      if (host !== "api.tphch.com") return "https://api.tphch.com";
    }
    return "";
  }());
  const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const trackedControls = new Set();
  const MESSAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const gateRequired = Boolean(document.getElementById("workCloud"));
  let lastPageKey = "";

  const state = {
    unlocked: gateRequired ? readBool(STORAGE.unlocked) : true,
    freshUnlock: false,
    gateState: "locked",
    sending: false,
    sessionId: readOrInitSessionId(),
    apiBase: resolveApiBase(),
    messages: readMessages(),
    currentPage: buildPageView(),
    pendingGateError: ""
  };

  const els = {};

  function readBool(key) {
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  }

  function readMessages() {
    try {
      const raw = localStorage.getItem(STORAGE.messages);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const now = Date.now();
      const savedAt = Number(parsed?.savedAt || 0);
      const fromObject = Array.isArray(parsed?.messages) ? parsed.messages : null;
      const fromArray = Array.isArray(parsed) ? parsed : null;
      const source = fromObject || fromArray || [];

      if (savedAt > 0 && (now - savedAt) > MESSAGE_TTL_MS) {
        localStorage.removeItem(STORAGE.messages);
        return [];
      }

      return source.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-30);
    } catch {
      return [];
    }
  }

  function readOrInitSessionId() {
    try {
      const existing = localStorage.getItem(STORAGE.sessionId);
      if (existing) return existing;
      const id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(STORAGE.sessionId, id);
      return id;
    } catch {
      return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }
  }

  function resolveApiBase() {
    const configured = String(config.apiBase || "").trim();
    if (configured) return configured.replace(/\/+$/, "");
    return defaultApiBase.replace(/\/+$/, "");
  }

  function toApiUrl(pathname) {
    if (!state.apiBase) return pathname;
    return `${state.apiBase}${pathname}`;
  }

  function buildPageView() {
    return {
      type: "page_view",
      url: window.location.href,
      title: document.title || "",
      siteName: window.location.hostname || "",
      path: window.location.pathname || "",
      referrer: document.referrer || "",
      ts: Date.now()
    };
  }

  function emitEvent(event) {
    const payload = {
      sessionId: state.sessionId,
      source: "site-assistant",
      event
    };

    return fetch(toApiUrl("/api/site-chat/events"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => {
      // Silent failure to avoid blocking browsing.
    });
  }

  function emitGateState(nextState, extra) {
    state.gateState = nextState;
    const event = {
      type: "gate_state",
      state: nextState,
      ts: Date.now()
    };

    if (extra && typeof extra.email === "string") event.email = extra.email;
    if (extra && typeof extra.error === "string") event.error = extra.error;

    emitEvent(event);
  }

  function emitChatCommand(action) {
    emitEvent({
      type: "chat_command",
      action,
      ts: Date.now()
    });
  }

  function maybeEmitPageView() {
    const page = buildPageView();
    const key = `${page.url}|${page.title}`;
    if (key === lastPageKey) return;
    lastPageKey = key;
    state.currentPage = page;
    emitEvent(page);
  }

  function bindNavigationObserver() {
    maybeEmitPageView();

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function patchedPushState() {
      originalPushState.apply(this, arguments);
      setTimeout(maybeEmitPageView, 0);
    };

    history.replaceState = function patchedReplaceState() {
      originalReplaceState.apply(this, arguments);
      setTimeout(maybeEmitPageView, 0);
    };

    window.addEventListener("popstate", maybeEmitPageView);
    window.addEventListener("hashchange", maybeEmitPageView);
    window.addEventListener("pageshow", maybeEmitPageView);
  }

  function isValidEmail(value) {
    const email = String(value || "").trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function collectGatedControls() {
    const explicit = Array.from(document.querySelectorAll("[data-gated-control]"));
    explicit.forEach((el) => trackedControls.add(el));
  }

  function resolveChatHost() {
    return document.querySelector(".site-wordmark, .site-nav");
  }

  function setControlLocked(el, locked) {
    if (!(el instanceof HTMLElement)) return;
    if (el.dataset.siteGateManaged !== "1") {
      el.dataset.siteGateManaged = "1";
      if ("disabled" in el) {
        el.dataset.siteGateWasDisabled = String(Boolean(el.disabled));
      }
      el.dataset.siteGateTabIndex = el.getAttribute("tabindex") || "";
      if (el.tagName === "A") {
        el.dataset.siteGateHref = el.getAttribute("href") || "";
      }
    }

    if (locked) {
      el.classList.add("site-gated-disabled");
      if ("disabled" in el) {
        el.disabled = true;
      }
      el.setAttribute("aria-disabled", "true");
      if (el.getAttribute("role") === "button" || el.tagName === "A" || el.tagName === "SUMMARY") {
        el.setAttribute("tabindex", "-1");
      }
      return;
    }

    el.classList.remove("site-gated-disabled");
    if ("disabled" in el) {
      el.disabled = el.dataset.siteGateWasDisabled === "true";
    }
    el.removeAttribute("aria-disabled");
    if (el.getAttribute("role") === "button" || el.tagName === "A" || el.tagName === "SUMMARY") {
      const prev = el.dataset.siteGateTabIndex || "";
      if (prev) {
        el.setAttribute("tabindex", prev);
      } else {
        el.removeAttribute("tabindex");
      }
    }
  }

  function applyGateToControls(locked) {
    trackedControls.forEach((el) => setControlLocked(el, locked));
  }

  function persistMessages() {
    try {
      localStorage.setItem(STORAGE.messages, JSON.stringify({
        savedAt: Date.now(),
        messages: state.messages
      }));
    } catch {
      // no-op
    }
  }

  function addMessage(role, content, persist) {
    const safeRole = role === "user" ? "user" : "assistant";
    const normalized = String(content || "").trim();
    if (!normalized) return;

    if (persist) {
      state.messages.push({ role: safeRole, content: normalized });
      state.messages = state.messages.slice(-30);
      persistMessages();
    }

    renderTranscript();
  }

  function clearMessages() {
    state.messages = [];
    try {
      localStorage.removeItem(STORAGE.messages);
    } catch {
      // no-op
    }
    renderTranscript();
  }

  function renderTranscript() {
    if (!els.output) return;

    if (state.messages.length === 0) {
      els.output.dataset.empty = "1";
      els.output.textContent = "flint> Waiting for your first command.";
      return;
    }

    const lines = state.messages.slice(-6).map((message) => {
      const prefix = message.role === "user" ? "you$" : "flint>";
      return `${prefix} ${message.content}`;
    });

    els.output.dataset.empty = "0";
    els.output.textContent = lines.join("\n");
    els.output.scrollTop = els.output.scrollHeight;
  }

  function setStatus(text, isError) {
    if (!els.status) return;
    els.status.textContent = text;
    els.status.classList.toggle("error", Boolean(isError));
  }

  async function sendChatMessage(question) {
    const trimmed = String(question || "").trim().slice(0, 4000);
    if (!trimmed || state.sending) return;

    state.sending = true;
    els.chatSend.disabled = true;
    addMessage("user", trimmed, true);
    setStatus("Running command...", false);
    emitChatCommand("submit");

    try {
      const response = await fetch(toApiUrl("/api/chat/message"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: state.sessionId,
          modelRef: "minimax/MiniMax-M2.1",
          messages: state.messages.slice(-16),
          page: buildPageView()
        })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Chat request failed (${response.status}): ${text.slice(0, 160)}`);
      }

      const data = await response.json();
      const assistant = String(data?.assistant?.content || data?.assistantMessage?.content || "").trim();
      if (!assistant) throw new Error("Assistant returned an empty response.");
      addMessage("assistant", assistant, true);
      setStatus("Ready", false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Request failed", true);
      addMessage("assistant", "I ran into a temporary error. Please try again.", true);
    } finally {
      state.sending = false;
      els.chatSend.disabled = false;
      els.chatInput.focus();
    }
  }

  async function submitEmailGate(email) {
    emitGateState("unlocking", { email });
    els.gateError.textContent = "";
    els.gateProgress.textContent = "Unlocking...";
    els.gateSubmit.disabled = true;

    state.unlocked = true;
    state.freshUnlock = true;
    try {
      localStorage.setItem(STORAGE.unlocked, "1");
      localStorage.setItem(STORAGE.email, email);
    } catch {
      // no-op
    }

    emitGateState("unlocked", { email });
    updateUiForGateState();
    revealHeaderOncePerSession();
    setStatus("Ready", false);
    els.gateSubmit.disabled = false;
    els.gateProgress.textContent = "";
  }

  function revealHeaderOncePerSession() {
    if (reducedMotion) return;
    try {
      if (sessionStorage.getItem(SESSION.revealPlayed) === "1") return;
      sessionStorage.setItem(SESSION.revealPlayed, "1");
    } catch {
      // no-op
    }

    els.chatBar.classList.add("reveal");
    window.setTimeout(() => els.chatBar.classList.remove("reveal"), 320);
  }

  function playVaultAnimation(onComplete) {
    if (reducedMotion) { onComplete(); return; }
    els.gate.classList.add("vault-opening");
    window.setTimeout(() => {
      els.gate.classList.remove("vault-opening");
      onComplete();
    }, 820);
  }

  function triggerTagGlow() {
    if (reducedMotion) return;
    els.chatBar.classList.remove("sa-glow");
    void els.chatBar.offsetWidth;
    els.chatBar.classList.add("sa-glow");
    window.setTimeout(() => els.chatBar.classList.remove("sa-glow"), 1700);
  }

  function revealButtons() {
    if (reducedMotion) return;
    const dropdowns = document.querySelectorAll(".work-dropdown");
    dropdowns.forEach((el, i) => {
      window.setTimeout(() => el.classList.add("gate-revealed"), i * 90);
    });
  }

  function updateUiForGateState() {
    const locked = !state.unlocked;
    applyGateToControls(locked);

    els.chatBar.hidden = locked;

    if (locked) {
      els.gate.hidden = false;
      if (state.pendingGateError) {
        els.gateError.textContent = state.pendingGateError;
      } else {
        els.gateError.textContent = "";
      }
      requestAnimationFrame(() => els.gateEmail.focus());
      return;
    }

    if (state.freshUnlock) {
      state.freshUnlock = false;
      els.gate.hidden = false;
      playVaultAnimation(() => {
        els.gate.hidden = true;
        requestAnimationFrame(() => els.chatInput.focus());
        triggerTagGlow();
      });
      revealButtons();
    } else {
      els.gate.hidden = true;
    }
    els.gateError.textContent = "";
    state.pendingGateError = "";
  }

  function buildUi() {
    const root = document.createElement("div");
    root.id = "siteAssistantRoot";
    root.setAttribute("data-site-chat-owned", "1");

    const chatBar = document.createElement("section");
    chatBar.className = "site-assistant-cli";
    chatBar.id = "siteAssistantCli";
    chatBar.hidden = true;

    const composer = document.createElement("form");
    composer.className = "site-assistant-cli-form";

    const prompt = document.createElement("span");
    prompt.className = "site-assistant-cli-prompt";
    prompt.setAttribute("aria-hidden", "true");
    prompt.textContent = "flint@site:~$";

    const input = document.createElement("input");
    input.id = "siteAssistantInput";
    input.className = "site-assistant-cli-input";
    input.type = "text";
    input.placeholder = "ask-flint --about \"your idea\"";
    input.maxLength = 4000;
    input.autocomplete = "off";
    input.setAttribute("aria-label", "Ask Flint");

    const send = document.createElement("button");
    send.type = "submit";
    send.className = "site-assistant-send";
    send.textContent = "Run";

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "site-assistant-clear";
    clear.setAttribute("aria-label", "Clear chat history");
    clear.textContent = "Clear";

    composer.appendChild(prompt);
    composer.appendChild(input);
    composer.appendChild(send);
    composer.appendChild(clear);

    const status = document.createElement("p");
    status.className = "site-assistant-status";
    status.id = "siteAssistantStatus";
    status.textContent = "Ready";

    const output = document.createElement("pre");
    output.className = "site-assistant-cli-output";
    output.id = "siteAssistantOutput";
    output.dataset.empty = "1";
    output.textContent = "flint> Waiting for your first command.";

    chatBar.appendChild(composer);
    chatBar.appendChild(status);
    chatBar.appendChild(output);

    document.body.appendChild(root);

    const chatHost = resolveChatHost();
    if (chatHost) {
      chatHost.classList.add("sa-chat-host");
      if (chatHost.classList.contains("site-wordmark")) {
        chatHost.classList.add("sa-chat-host-wordmark");
      } else {
        chatHost.classList.add("sa-chat-host-nav");
      }
      chatHost.appendChild(chatBar);
    } else {
      chatBar.classList.add("site-assistant-cli-fallback");
      root.appendChild(chatBar);
    }

    const gate = document.createElement("section");
    gate.className = "site-email-gate";
    gate.id = "siteEmailGate";
    gate.setAttribute("role", "dialog");
    gate.setAttribute("aria-modal", "true");
    gate.setAttribute("aria-labelledby", "siteEmailGateTitle");

    const gatePanel = document.createElement("div");
    gatePanel.className = "site-email-gate-panel";

    const gateTitle = document.createElement("h2");
    gateTitle.id = "siteEmailGateTitle";
    gateTitle.className = "site-email-gate-title";
    gateTitle.textContent = "Unlock Flint";

    const gateCopy = document.createElement("p");
    gateCopy.className = "site-email-gate-copy";
    gateCopy.textContent = "Enter your email to unlock the project menu and assistant.";

    const gateForm = document.createElement("form");
    gateForm.className = "site-email-gate-form";

    const gateEmail = document.createElement("input");
    gateEmail.id = "siteGateEmail";
    gateEmail.type = "email";
    gateEmail.required = true;
    gateEmail.placeholder = "your@email.com";
    gateEmail.autocomplete = "email";

    const gateSubmit = document.createElement("button");
    gateSubmit.type = "submit";
    gateSubmit.className = "site-email-gate-submit";
    gateSubmit.textContent = "Unlock";

    const gateProgress = document.createElement("p");
    gateProgress.className = "site-email-gate-progress";
    gateProgress.id = "siteGateProgress";

    const gateError = document.createElement("p");
    gateError.className = "site-email-gate-error";
    gateError.id = "siteGateError";

    gateForm.appendChild(gateEmail);
    gateForm.appendChild(gateSubmit);
    gateForm.appendChild(gateProgress);
    gateForm.appendChild(gateError);

    gatePanel.appendChild(gateTitle);
    gatePanel.appendChild(gateCopy);
    gatePanel.appendChild(gateForm);
    gate.appendChild(gatePanel);

    const workCloud = document.getElementById("workCloud");
    if (workCloud) {
      workCloud.style.position = "relative";
      workCloud.appendChild(gate);
    } else {
      root.appendChild(gate);
    }

    els.root = root;
    els.chatBar = chatBar;
    els.chatForm = composer;
    els.chatInput = input;
    els.chatSend = send;
    els.chatClear = clear;
    els.status = status;
    els.output = output;
    els.gate = gate;
    els.gateForm = gateForm;
    els.gateEmail = gateEmail;
    els.gateSubmit = gateSubmit;
    els.gateProgress = gateProgress;
    els.gateError = gateError;
  }

  function bindUi() {
    els.chatClear.addEventListener("click", () => {
      clearMessages();
      setStatus("History cleared", false);
      emitChatCommand("clear");
      requestAnimationFrame(() => els.chatInput.focus());
    });

    els.chatForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = els.chatInput.value;
      els.chatInput.value = "";
      sendChatMessage(value);
    });

    if (gateRequired) {
      els.gateForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const email = String(els.gateEmail.value || "").trim();
        if (!isValidEmail(email)) {
          state.pendingGateError = "Enter a valid email address.";
          updateUiForGateState();
          emitGateState("error", { email, error: state.pendingGateError });
          return;
        }
        state.pendingGateError = "";
        submitEmailGate(email);
      });
    }

    if (gateRequired) {
      document.addEventListener("click", (event) => {
        if (state.unlocked) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        const blocked = target.closest("[data-gated-control]");
        if (!blocked) return;
        if (els.root && els.root.contains(blocked)) return;
        event.preventDefault();
        event.stopPropagation();
        requestAnimationFrame(() => els.gateEmail.focus());
      }, true);
    }
  }

  function init() {
    const legacyChatRoot = document.getElementById("flintChatRoot");
    if (legacyChatRoot) legacyChatRoot.remove();

    buildUi();
    renderTranscript();
    setStatus("Ready", false);
    bindUi();
    collectGatedControls();

    if (state.unlocked) {
      emitGateState("unlocked");
    } else {
      emitGateState("locked");
    }

    updateUiForGateState();
    bindNavigationObserver();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
