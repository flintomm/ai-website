(function siteAssistantBootstrap() {
  window.__FLINT_SITE_ASSISTANT_ACTIVE = true;

  const STORAGE = {
    unlocked: "site_assistant_unlocked_v1",
    email: "site_assistant_email_v1",
    sessionId: "site_assistant_session_id_v1",
    transcript: "site_assistant_messages_v1",
    apiBase: "site_assistant_api_base_v1",
    legacyOpen: "site_assistant_open_v1"
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
  const MAX_TRANSCRIPT_ENTRIES = 60;
  const MAX_CHAT_HISTORY = 16;
  const gateRequired = Boolean(document.getElementById("workCloud"));
  let lastPageKey = "";

  const sessionInfo = readOrInitSessionId();
  const state = {
    unlocked: gateRequired ? readBool(STORAGE.unlocked) : true,
    freshUnlock: false,
    gateState: "locked",
    minimized: false,
    homeDocked: false,
    sending: false,
    sessionId: sessionInfo.id,
    sessionIsNew: sessionInfo.isNew,
    apiBase: resolveApiBase(),
    transcript: readTranscript(),
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

  function normalizeEntryType(value) {
    if (value === "user" || value === "assistant" || value === "system") return value;
    return null;
  }

  function normalizeEntryState(type, value) {
    if (type !== "system") return "";
    if (value === "ready" || value === "busy" || value === "error") return value;
    return "info";
  }

  function makeLegacyTimestamp(index, total) {
    const offset = Math.max(total - index, 1);
    return Date.now() - (offset * 1000);
  }

  function sanitizeEntry(entry, fallbackTs) {
    const type = normalizeEntryType(entry?.type || entry?.role);
    const content = String(entry?.content || "").trim();
    if (!type || !content) return null;

    const rawTs = Number(entry?.ts || entry?.timestamp || fallbackTs || Date.now());
    const ts = Number.isFinite(rawTs) && rawTs > 0 ? rawTs : Date.now();
    const safeEntry = { type, content, ts };
    const stateValue = normalizeEntryState(type, entry?.state);
    if (stateValue) safeEntry.state = stateValue;
    return safeEntry;
  }

  function readTranscript() {
    try {
      const raw = localStorage.getItem(STORAGE.transcript);
      if (!raw) return [];

      const parsed = JSON.parse(raw);
      const now = Date.now();
      const savedAt = Number(parsed?.savedAt || 0);
      if (savedAt > 0 && (now - savedAt) > MESSAGE_TTL_MS) {
        localStorage.removeItem(STORAGE.transcript);
        return [];
      }

      if (Array.isArray(parsed?.entries)) {
        return parsed.entries
          .map((entry, index) => sanitizeEntry(entry, now - ((parsed.entries.length - index) * 1000)))
          .filter(Boolean)
          .slice(-MAX_TRANSCRIPT_ENTRIES);
      }

      const legacyMessages = Array.isArray(parsed?.messages)
        ? parsed.messages
        : (Array.isArray(parsed) ? parsed : []);

      return legacyMessages
        .map((message, index) => sanitizeEntry(message, makeLegacyTimestamp(index, legacyMessages.length)))
        .filter(Boolean)
        .slice(-MAX_TRANSCRIPT_ENTRIES);
    } catch {
      return [];
    }
  }

  function persistTranscript() {
    try {
      localStorage.setItem(STORAGE.transcript, JSON.stringify({
        version: 2,
        savedAt: Date.now(),
        entries: state.transcript
      }));
    } catch {
      // no-op
    }
  }

  function retireLegacyOpenState() {
    try {
      localStorage.removeItem(STORAGE.legacyOpen);
    } catch {
      // no-op
    }
  }

  function readOrInitSessionId() {
    try {
      const existing = localStorage.getItem(STORAGE.sessionId);
      if (existing) return { id: existing, isNew: false };
      const id = (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
        ? crypto.randomUUID()
        : `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(STORAGE.sessionId, id);
      return { id, isNew: true };
    } catch {
      return {
        id: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        isNew: true
      };
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

  function formatPageLabel(page) {
    const path = String(page?.path || "").trim() || "/";
    return path.length > 40 ? `...${path.slice(-37)}` : path;
  }

  function formatTime(ts) {
    const value = Number(ts);
    if (!Number.isFinite(value) || value <= 0) return "--:--";
    return new Date(value).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  }

  function prefixForEntry(entry) {
    if (entry.type === "user") return "guest$";
    if (entry.type === "assistant") return "flint>";
    return "sys::";
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

  function appendTranscriptEntry(type, content, options = {}) {
    const safeType = normalizeEntryType(type);
    const safeContent = String(content || "").trim();
    if (!safeType || !safeContent) return;

    const entry = {
      type: safeType,
      content: safeContent,
      ts: Number.isFinite(Number(options.ts)) && Number(options.ts) > 0 ? Number(options.ts) : Date.now()
    };

    if (safeType === "system") {
      entry.state = normalizeEntryState(safeType, options.state);
    }

    state.transcript.push(entry);
    state.transcript = state.transcript.slice(-MAX_TRANSCRIPT_ENTRIES);

    if (options.persist !== false) persistTranscript();
    renderTranscript();
  }

  function appendSystemLine(content, stateValue, options = {}) {
    appendTranscriptEntry("system", content, {
      state: stateValue || "info",
      persist: options.persist,
      ts: options.ts
    });
  }

  function clearTranscript() {
    state.transcript = [];
    persistTranscript();
    appendSystemLine("history cleared", "info");
  }

  function renderTranscript() {
    if (!els.transcript) return;
    els.transcript.innerHTML = "";

    if (state.transcript.length === 0) {
      const empty = document.createElement("li");
      empty.className = "site-assistant-empty";
      empty.textContent = "sys:: terminal ready";
      els.transcript.appendChild(empty);
      return;
    }

    state.transcript.forEach((entry) => {
      const item = document.createElement("li");
      item.className = `site-assistant-entry ${entry.type}`;
      if (entry.type === "system" && entry.state) item.dataset.state = entry.state;

      const time = document.createElement("span");
      time.className = "site-assistant-entry-time";
      time.textContent = formatTime(entry.ts);

      const prefix = document.createElement("span");
      prefix.className = "site-assistant-entry-prefix";
      prefix.textContent = prefixForEntry(entry);

      const text = document.createElement("span");
      text.className = "site-assistant-entry-content";
      text.textContent = entry.content;

      item.appendChild(time);
      item.appendChild(prefix);
      item.appendChild(text);
      els.transcript.appendChild(item);
    });

    els.transcript.scrollTop = els.transcript.scrollHeight;
  }

  function setStatus(text, stateValue) {
    if (!els.terminal) return;
    const nextState = stateValue || "info";
    els.terminal.dataset.state = nextState;
    els.terminal.setAttribute("aria-busy", nextState === "busy" ? "true" : "false");
  }

  function setTerminalMinimized(minimized, options = {}) {
    const nextMinimized = Boolean(minimized);
    state.minimized = nextMinimized;

    if (!els.terminal || !els.transcript || !els.chatToggle) return;

    els.terminal.classList.toggle("is-minimized", nextMinimized);
    els.transcript.hidden = nextMinimized;
    if (els.chatClear) els.chatClear.hidden = nextMinimized;

    els.chatToggle.textContent = nextMinimized ? "+" : "-";
    els.chatToggle.setAttribute("aria-label", nextMinimized ? "Expand terminal" : "Minimize terminal");

    if (!nextMinimized) {
      els.transcript.scrollTop = els.transcript.scrollHeight;
      if (!options.skipFocus && state.unlocked && !state.sending && els.chatInput) {
        requestAnimationFrame(() => els.chatInput.focus());
      }
    }
  }

  function setHomeDocked(docked) {
    const nextDocked = Boolean(docked);
    if (state.homeDocked === nextDocked) return;

    state.homeDocked = nextDocked;

    if (els.homeDockSection) {
      els.homeDockSection.classList.toggle("sa-work-active", nextDocked);
    }

    if (els.host && els.host.classList.contains("site-wordmark")) {
      els.host.classList.toggle("sa-home-docked-bottom", nextDocked);
    }
    document.body.classList.toggle("sa-work-active", nextDocked);
    document.body.classList.toggle("sa-home-docked-bottom", nextDocked);
  }

  function updateHomeDocking() {
    if (!els.homeDockSection || !els.host || !els.host.classList.contains("site-wordmark")) return;

    const rect = els.homeDockSection.getBoundingClientRect();
    const entryThreshold = window.innerHeight * 0.34;
    const workActive = rect.top <= entryThreshold && rect.bottom > 0;
    setHomeDocked(workActive);
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
    }

    if (locked) {
      el.classList.add("site-gated-disabled");
      if ("disabled" in el) el.disabled = true;
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
      const previousTabIndex = el.dataset.siteGateTabIndex || "";
      if (previousTabIndex) {
        el.setAttribute("tabindex", previousTabIndex);
      } else {
        el.removeAttribute("tabindex");
      }
    }
  }

  function applyGateToControls(locked) {
    trackedControls.forEach((el) => setControlLocked(el, locked));
  }

  function syncTerminalControls() {
    const disabled = !state.unlocked || state.sending;
    if (els.chatInput) els.chatInput.disabled = disabled;
    if (els.chatSend) els.chatSend.disabled = disabled;
    if (els.chatClear) els.chatClear.disabled = disabled;
    if (els.chatToggle) els.chatToggle.disabled = disabled;
    if (els.terminal) els.terminal.classList.toggle("is-disabled", !state.unlocked);
  }

  function bindHomeDocking() {
    if (!els.homeDockSection || !els.host || !els.host.classList.contains("site-wordmark")) return;

    let frame = null;
    const requestUpdate = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        updateHomeDocking();
      });
    };

    requestUpdate();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    window.addEventListener("pageshow", requestUpdate);
  }

  function maybeEmitPageView() {
    const page = buildPageView();
    const key = `${page.url}|${page.title}`;
    if (key === lastPageKey) return;

    lastPageKey = key;
    state.currentPage = page;
    emitEvent(page);
    appendSystemLine(`page -> ${formatPageLabel(page)}`, "info");
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

  function formatErrorMessage(error) {
    const message = error instanceof Error ? error.message : "request failed";
    return message.replace(/\s+/g, " ").trim().slice(0, 88) || "request failed";
  }

  function getConversationMessages() {
    return state.transcript
      .filter((entry) => entry && (entry.type === "user" || entry.type === "assistant"))
      .slice(-MAX_CHAT_HISTORY)
      .map((entry) => ({ role: entry.type, content: entry.content }));
  }

  async function sendChatMessage(question) {
    const trimmed = String(question || "").trim().slice(0, 4000);
    if (!trimmed || state.sending || !state.unlocked) return;

    if (state.minimized) {
      setTerminalMinimized(false, { skipFocus: true });
    }

    state.sending = true;
    syncTerminalControls();
    appendTranscriptEntry("user", trimmed);
    emitChatCommand("submit");
    appendSystemLine("request sent", "info");
    appendSystemLine("thinking", "busy");
    setStatus("thinking", "busy");

    try {
      const response = await fetch(toApiUrl("/api/chat/message"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: state.sessionId,
          modelRef: "minimax/MiniMax-M2.1",
          messages: getConversationMessages(),
          page: buildPageView()
        })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`chat ${response.status}: ${text.slice(0, 120)}`);
      }

      const data = await response.json();
      const assistant = String(data?.assistant?.content || data?.assistantMessage?.content || "").trim();
      if (!assistant) throw new Error("empty response");

      appendTranscriptEntry("assistant", assistant);
      appendSystemLine("ready", "ready");
      setStatus("ready", "ready");
    } catch (error) {
      appendSystemLine(`request failed: ${formatErrorMessage(error)}`, "error");
      appendTranscriptEntry("assistant", "I ran into a temporary error. Please try again.");
      setStatus("error", "error");
    } finally {
      state.sending = false;
      syncTerminalControls();
      if (state.unlocked && els.chatInput) els.chatInput.focus();
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
    appendSystemLine("gate unlocked", "ready");
    setTerminalMinimized(false, { skipFocus: true });
    updateUiForGateState();
    setStatus("ready", "ready");
    els.gateSubmit.disabled = false;
    els.gateProgress.textContent = "";
  }

  function playVaultAnimation(onComplete) {
    if (!els.gate) {
      onComplete();
      return;
    }
    if (reducedMotion) {
      onComplete();
      return;
    }
    els.gate.classList.add("vault-opening");
    window.setTimeout(() => {
      els.gate.classList.remove("vault-opening");
      onComplete();
    }, 820);
  }

  function revealButtons() {
    if (reducedMotion) return;
    const dropdowns = document.querySelectorAll(".work-dropdown");
    dropdowns.forEach((el, index) => {
      window.setTimeout(() => el.classList.add("gate-revealed"), index * 90);
    });
  }

  function updateUiForGateState() {
    const locked = !state.unlocked;
    applyGateToControls(locked);

    if (els.host) els.host.classList.toggle("sa-terminal-locked", locked);
    if (els.terminal) {
      els.terminal.hidden = locked;
      els.terminal.setAttribute("aria-hidden", String(locked));
    }

    syncTerminalControls();

    if (locked) {
      if (els.gate) els.gate.hidden = false;
      if (state.pendingGateError) {
        els.gateError.textContent = state.pendingGateError;
      } else {
        els.gateError.textContent = "";
      }
      setStatus("locked", "error");
      requestAnimationFrame(() => {
        if (els.gateEmail) els.gateEmail.focus();
      });
      return;
    }

    if (state.freshUnlock) {
      state.freshUnlock = false;
      if (els.gate) els.gate.hidden = false;
      playVaultAnimation(() => {
        if (els.gate) els.gate.hidden = true;
        requestAnimationFrame(() => {
          if (els.chatInput) els.chatInput.focus();
        });
      });
      revealButtons();
    } else if (els.gate) {
      els.gate.hidden = true;
    }

    state.pendingGateError = "";
    if (els.gateError) els.gateError.textContent = "";
    setStatus(state.sending ? "thinking" : "ready", state.sending ? "busy" : "ready");
  }

  function buildUi() {
    const root = document.createElement("div");
    root.id = "siteAssistantRoot";
    root.setAttribute("data-site-chat-owned", "1");
    document.body.appendChild(root);

    const terminal = document.createElement("section");
    terminal.className = "site-assistant-inline";
    terminal.id = "siteAssistantTerminal";
    terminal.setAttribute("aria-label", "Flint inline terminal");
    terminal.hidden = gateRequired && !state.unlocked;

    const transcript = document.createElement("ol");
    transcript.className = "site-assistant-transcript";
    transcript.id = "siteAssistantTranscript";
    transcript.setAttribute("role", "log");
    transcript.setAttribute("aria-live", "polite");
    transcript.setAttribute("aria-relevant", "additions text");

    const composer = document.createElement("form");
    composer.className = "site-assistant-form";

    const label = document.createElement("label");
    label.className = "site-assistant-visually-hidden";
    label.setAttribute("for", "siteAssistantInput");
    label.textContent = "Message Flint";

    const prompt = document.createElement("span");
    prompt.className = "site-assistant-prompt-prefix";
    prompt.textContent = ">";

    const input = document.createElement("input");
    input.id = "siteAssistantInput";
    input.className = "site-assistant-input";
    input.type = "text";
    input.placeholder = "type a message";
    input.maxLength = 4000;
    input.autocomplete = "off";

    const send = document.createElement("button");
    send.type = "submit";
    send.className = "site-assistant-send";
    send.textContent = "run";

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "site-assistant-clear";
    clear.setAttribute("aria-label", "Clear terminal history");
    clear.textContent = "clear";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "site-assistant-toggle";
    toggle.setAttribute("aria-label", "Minimize terminal");
    toggle.textContent = "-";

    composer.appendChild(label);
    composer.appendChild(prompt);
    composer.appendChild(input);
    composer.appendChild(send);
    composer.appendChild(clear);
    composer.appendChild(toggle);

    terminal.appendChild(transcript);
    terminal.appendChild(composer);

    const chatHost = resolveChatHost();
    if (chatHost) {
      chatHost.classList.add("sa-chat-host");
      if (chatHost.classList.contains("site-wordmark")) {
        chatHost.classList.add("sa-chat-host-wordmark");
      } else {
        chatHost.classList.add("sa-chat-host-nav");
      }

      if (chatHost.lastElementChild) {
        chatHost.insertBefore(terminal, chatHost.lastElementChild);
      } else {
        chatHost.appendChild(terminal);
      }
    } else {
      root.appendChild(terminal);
    }

    const gate = document.createElement("section");
    gate.className = "site-email-gate";
    gate.id = "siteEmailGate";
    gate.setAttribute("role", "dialog");
    gate.setAttribute("aria-modal", "true");
    gate.setAttribute("aria-labelledby", "siteEmailGateTitle");
    gate.hidden = !gateRequired || state.unlocked;

    const gatePanel = document.createElement("div");
    gatePanel.className = "site-email-gate-panel";

    const gateTitle = document.createElement("h2");
    gateTitle.id = "siteEmailGateTitle";
    gateTitle.className = "site-email-gate-title";
    gateTitle.textContent = "Unlock Flint";

    const gateCopy = document.createElement("p");
    gateCopy.className = "site-email-gate-copy";
    gateCopy.textContent = "Enter your email to open the terminal.";

    const gateForm = document.createElement("form");
    gateForm.className = "site-email-gate-form";

    const gateEmailLabel = document.createElement("label");
    gateEmailLabel.className = "site-assistant-visually-hidden";
    gateEmailLabel.setAttribute("for", "siteGateEmail");
    gateEmailLabel.textContent = "Email";

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

    gateForm.appendChild(gateEmailLabel);
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
    els.host = chatHost;
    els.homeDockSection = chatHost && chatHost.classList.contains("site-wordmark")
      ? document.getElementById("section-4")
      : null;
    els.terminal = terminal;
    els.transcript = transcript;
    els.chatForm = composer;
    els.chatInput = input;
    els.chatSend = send;
    els.chatClear = clear;
    els.chatToggle = toggle;
    els.gate = gate;
    els.gateForm = gateForm;
    els.gateEmail = gateEmail;
    els.gateSubmit = gateSubmit;
    els.gateProgress = gateProgress;
    els.gateError = gateError;
  }

  function bindUi() {
    els.chatClear.addEventListener("click", () => {
      emitChatCommand("clear");
      clearTranscript();
      setStatus("ready", "ready");
      if (state.unlocked) requestAnimationFrame(() => els.chatInput.focus());
    });

    els.chatToggle.addEventListener("click", () => {
      setTerminalMinimized(!state.minimized, { skipFocus: true });
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

    retireLegacyOpenState();
    buildUi();
    renderTranscript();
    setTerminalMinimized(false, { skipFocus: true });
    bindUi();
    collectGatedControls();

    appendSystemLine(state.sessionIsNew ? "session initialized" : "session restored", "info");

    if (gateRequired) {
      if (state.unlocked) {
        emitGateState("unlocked");
        appendSystemLine("gate unlocked", "ready");
      } else {
        emitGateState("locked");
        appendSystemLine("gate locked", "info");
      }
    }

    updateUiForGateState();
    bindNavigationObserver();
    bindHomeDocking();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
}());
