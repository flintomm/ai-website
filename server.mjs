import { createServer } from "node:http";
import { createReadStream, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number.parseInt(process.env.PORT || "8080", 10);
const HOST = process.env.HOST || "0.0.0.0";
const NODE_ENV = process.env.NODE_ENV || "development";

const ALLOWED_ORIGINS = (process.env.SITE_CHAT_ALLOWED_ORIGINS || "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = Number.parseInt(process.env.SITE_CHAT_RATE_LIMIT_MAX || "30", 10);
const rateLimitStore = new Map();
const SESSION_LIMIT_WINDOW_MS = 60 * 60_000;
const SESSION_LIMIT_MAX = Number.parseInt(process.env.SITE_CHAT_SESSION_LIMIT_MAX || "40", 10);
const SESSION_MIN_INTERVAL_MS = Number.parseInt(process.env.SITE_CHAT_MIN_INTERVAL_MS || "2000", 10);
const sessionLimitStore = new Map();
const CHAT_MAX_TOTAL_CHARS = Number.parseInt(process.env.SITE_CHAT_MAX_CONTEXT_CHARS || "7000", 10);

const MINIMAX_BASE_URL = String(process.env.MINIMAX_BASE_URL || "https://api.minimax.io/anthropic").replace(/\/+$/, "");
const MINIMAX_API_KEY = String(process.env.MINIMAX_API_KEY || "").trim();
const DEFAULT_MODEL = String(process.env.SITE_CHAT_DEFAULT_MODEL || "minimax/MiniMax-M2.1").trim();
const MODEL_ALLOWLIST = [
  "minimax/MiniMax-M2.5",
  "minimax/MiniMax-M2.1",
  "minimax/MiniMax-M2.1-lightning"
];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".txt": "text/plain; charset=utf-8"
};

const CONCIERGE_GUIDE_PATH = path.join(__dirname, "docs", "flint-concierge-guide.md");
const SITE_KNOWLEDGE_PATH = path.join(__dirname, "docs", "flint-site-knowledge.md");
const CONCIERGE_SECTION_FALLBACK = {
  owner_and_host: "Tommy is the Owner of this website. Flint is Tommy's AI assistant and concierge host for visitors.",
  style_policy: "Keep responses brief (1-3 short sentences, usually under 70 words), warm, and practical. Do not offer follow-up suggestions unless the visitor explicitly asks for recommendations. Keep hotel metaphor light (1-2 phrases max) and always use real page names/paths.",
  guidance_policy: "When users ask where to go, suggest 1-3 relevant destinations with real labels and paths.",
  handoff_policy: "Offer an owner handoff only for explicit hiring/collaboration/contact intent or repeated confusion."
};
const KNOWLEDGE_SECTION_FALLBACK = {
  site_overview: "This website is Flint and Tommy's portfolio with Creative work, Data Dashboards, and Digital Games.",
  navigation_map: "Main paths: /, /pages/creative/creative-work.html, /pages/dashboards/roster-architect/roster-architect.html, /pages/dashboards/budget-calculator/budget-calculator.html, /pages/games/tower-defense.html, /pages/games/board-hub.html",
  home_page: "Homepage introduces Flint and offers project entry points through the Work section dropdowns.",
  creative_corner: "Creative Corner showcases between the spaces and in-progress creative projects.",
  roster_architect: "Roster Architect is an NBA roster and salary-cap simulator with setup, draft, and outcome views.",
  budget_calculator: "Budget Calculator is a budget planning dashboard for planned vs actual spending.",
  tower_defense: "Tower Defense is a canvas strategy game with build, wave, pause, and reset controls.",
  board_arcade: "Board Arcade includes Tic-Tac-Toe, Checkers, and Chess with reset controls."
};
const DESTINATION_KNOWLEDGE_SECTION = {
  lobby: "home_page",
  creative_corner: "creative_corner",
  roster_architect: "roster_architect",
  budget_calculator: "budget_calculator",
  tower_defense: "tower_defense",
  board_arcade: "board_arcade"
};
const KNOWLEDGE_KEYWORDS = {
  site_overview: ["website", "site", "portfolio", "projects", "flint", "tommy"],
  navigation_map: ["where", "go", "navigate", "path", "url", "link", "start", "visit", "menu", "home"],
  home_page: ["home", "homepage", "lobby", "work section", "dropdown", "ask flint"],
  creative_corner: ["creative", "music", "between the spaces", "trailers", "comics", "ambient", "art"],
  roster_architect: ["roster", "architect", "nba", "draft", "salary cap", "luxury tax", "apron", "payroll", "franchise"],
  budget_calculator: ["budget", "income", "expense", "planned", "actual", "safe to spend", "50/30/20", "finale"],
  tower_defense: ["tower", "defense", "wave", "build menu", "credits", "lives", "pause", "reset game", "canvas"],
  board_arcade: ["board arcade", "tic", "tac", "toe", "checkers", "chess", "flip board", "swap first player"],
  common_routes: ["recommend", "explore", "what should i", "where to start", "next step", "tour"],
  troubleshooting: ["bug", "broken", "doesnt work", "doesn't work", "error", "issue", "load", "not working"]
};
const DESTINATIONS = [
  {
    key: "lobby",
    label: "Lobby (Home)",
    path: "/",
    aliases: ["/", "/index.html"],
    sectionId: "destination_lobby"
  },
  {
    key: "creative_corner",
    label: "Creative Corner",
    path: "/pages/creative/creative-work.html",
    aliases: ["/pages/creative/creative-work.html", "/pages/creative/index.html"],
    sectionId: "destination_creative"
  },
  {
    key: "roster_architect",
    label: "Roster Architect",
    path: "/pages/dashboards/roster-architect/roster-architect.html",
    aliases: [
      "/pages/dashboards/roster-architect/roster-architect.html",
      "/pages/dashboards/roster-architect/index.html"
    ],
    sectionId: "destination_roster_architect"
  },
  {
    key: "budget_calculator",
    label: "Budget Calculator",
    path: "/pages/dashboards/budget-calculator/budget-calculator.html",
    aliases: [
      "/pages/dashboards/budget-calculator/budget-calculator.html",
      "/pages/dashboards/budget-calculator/index.html"
    ],
    sectionId: "destination_budget_calculator"
  },
  {
    key: "tower_defense",
    label: "Tower Defense",
    path: "/pages/games/tower-defense.html",
    aliases: ["/pages/games/tower-defense.html", "/pages/games/index.html"],
    sectionId: "destination_tower_defense"
  },
  {
    key: "board_arcade",
    label: "Board Arcade",
    path: "/pages/games/board-hub.html",
    aliases: ["/pages/games/board-hub.html"],
    sectionId: "destination_board_arcade"
  }
];
const CONCIERGE_SECTIONS = loadConciergeSections();
const SITE_KNOWLEDGE_SECTIONS = loadKnowledgeSections();

function parseGuideSections(raw) {
  const sections = {};
  let currentKey = null;
  let currentLines = [];

  for (const line of String(raw || "").split("\n")) {
    const match = line.match(/^###\s+([a-z0-9_-]+)\s*$/i);
    if (match) {
      if (currentKey) sections[currentKey] = currentLines.join("\n").trim();
      currentKey = match[1].toLowerCase();
      currentLines = [];
      continue;
    }
    if (currentKey) currentLines.push(line);
  }

  if (currentKey) sections[currentKey] = currentLines.join("\n").trim();
  return sections;
}

function loadGuideSections(filePath, fallback) {
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = parseGuideSections(raw);
    return Object.keys(parsed).length > 0 ? parsed : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

function loadConciergeSections() {
  return loadGuideSections(CONCIERGE_GUIDE_PATH, CONCIERGE_SECTION_FALLBACK);
}

function loadKnowledgeSections() {
  return loadGuideSections(SITE_KNOWLEDGE_PATH, KNOWLEDGE_SECTION_FALLBACK);
}

function conciergeSection(id) {
  const key = String(id || "").toLowerCase();
  return String(CONCIERGE_SECTIONS[key] || CONCIERGE_SECTION_FALLBACK[key] || "").trim();
}

function knowledgeSection(id) {
  const key = String(id || "").toLowerCase();
  return String(SITE_KNOWLEDGE_SECTIONS[key] || KNOWLEDGE_SECTION_FALLBACK[key] || "").trim();
}

function normalizePath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "/";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function latestUserMessage(messages) {
  for (let i = (messages?.length || 0) - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg?.role === "user" && typeof msg?.content === "string") {
      return msg.content.trim();
    }
  }
  return "";
}

function isGuidanceIntent(text) {
  const value = String(text || "").toLowerCase();
  if (!value) return false;
  const patterns = [
    /\bwhere\b.+\b(start|go|begin)\b/,
    /\bwhat\b.+\b(check out|explore|visit|look at)\b/,
    /\bwhat should i\b/,
    /\brecommend\b/,
    /\bnext step\b/,
    /\btour\b/,
    /\bnavigate\b/
  ];
  return patterns.some((pattern) => pattern.test(value));
}

function isHandoffIntent(text) {
  const value = String(text || "").toLowerCase();
  if (!value) return false;
  const patterns = [
    /\bhire\b/,
    /\bcollab(?:orate|oration)?\b/,
    /\bproject inquiry\b/,
    /\bcontact tommy\b/,
    /\btalk to tommy\b/,
    /\bproposal\b/,
    /\bquote\b/,
    /\bpricing\b/,
    /\bi('| a)m stuck\b/,
    /\bconfused\b/,
    /\bnot sure\b/
  ];
  return patterns.some((pattern) => pattern.test(value));
}

function resolveDestination(page) {
  const currentPath = normalizePath(page?.path || "/");
  const exact = DESTINATIONS.find((destination) => destination.aliases.includes(currentPath));
  if (exact) return exact;

  const byPrefix = DESTINATIONS.find((destination) => {
    const alias = destination.aliases.find((item) => item !== "/" && currentPath.startsWith(item.replace(/\/index\.html$/, "")));
    return Boolean(alias);
  });
  return byPrefix || DESTINATIONS[0];
}

function destinationSuggestions(currentDestination, limit = 3) {
  return DESTINATIONS
    .filter((destination) => destination.key !== currentDestination.key)
    .slice(0, limit);
}

function conciergeSnippets({ destination, guidanceIntent, handoffIntent, maxSnippets = 3, maxChars = 1700 }) {
  const selected = [];
  const selectedIds = [
    "owner_and_host",
    "style_policy",
    destination.sectionId
  ];

  if (guidanceIntent) selectedIds.push("guidance_policy");
  if (handoffIntent) selectedIds.push("handoff_policy");

  let usedChars = 0;
  for (const id of selectedIds) {
    const text = conciergeSection(id);
    if (!text) continue;
    const snippet = `[${id}] ${text}`;
    if ((usedChars + snippet.length) > maxChars) continue;
    selected.push(snippet);
    usedChars += snippet.length;
    if (selected.length >= maxSnippets) break;
  }
  return selected;
}

function dedupePreserveOrder(values) {
  const seen = new Set();
  const unique = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    unique.push(value);
  }
  return unique;
}

function keywordScore(text, keywords) {
  if (!text || !Array.isArray(keywords) || keywords.length === 0) return 0;
  let score = 0;
  for (const keyword of keywords) {
    const term = String(keyword || "").trim().toLowerCase();
    if (!term) continue;
    if (text.includes(term)) score += term.includes(" ") ? 3 : 1;
  }
  return score;
}

function selectKnowledgeSectionIds({ destination, page, userText, guidanceIntent }) {
  const text = [
    String(userText || ""),
    String(page?.title || ""),
    String(page?.path || ""),
    String(page?.url || "")
  ].join(" ").toLowerCase();

  const destinationKey = destination?.key || "lobby";
  const ids = [
    "site_overview",
    "navigation_map",
    DESTINATION_KNOWLEDGE_SECTION[destinationKey] || "home_page"
  ];

  if (guidanceIntent) ids.push("common_routes");

  const scored = Object.entries(KNOWLEDGE_KEYWORDS)
    .map(([id, keywords]) => ({ id, score: keywordScore(text, keywords) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.id);

  return dedupePreserveOrder(ids.concat(scored));
}

function knowledgeSnippets({
  destination,
  page,
  userText,
  guidanceIntent,
  maxSnippets = 8,
  maxChars = 5200
}) {
  const selected = [];
  const ids = selectKnowledgeSectionIds({
    destination,
    page,
    userText,
    guidanceIntent
  });

  let usedChars = 0;
  for (const id of ids) {
    const text = knowledgeSection(id);
    if (!text) continue;
    const snippet = `[${id}] ${text}`;
    if ((usedChars + snippet.length) > maxChars) continue;
    selected.push(snippet);
    usedChars += snippet.length;
    if (selected.length >= maxSnippets) break;
  }
  return selected;
}

function sendJson(res, status, body) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (!origin) return;
  if (ALLOWED_ORIGINS.length === 0) return;
  if (!ALLOWED_ORIGINS.includes(origin)) return;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function enforceRateLimit(req) {
  const key = req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const current = rateLimitStore.get(key);
  if (!current || now - current.start > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(key, { start: now, count: 1 });
    return true;
  }
  current.count += 1;
  if (current.count > RATE_LIMIT_MAX) return false;
  return true;
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) reject(new Error("Request too large"));
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 1200) }))
    .filter((m) => Boolean(m.content))
    .slice(-16);
}

function trimMessagesByBudget(messages, maxChars = CHAT_MAX_TOTAL_CHARS) {
  let total = 0;
  const kept = [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    total += msg.content.length;
    if (total > maxChars) break;
    kept.push(msg);
  }
  return kept.reverse();
}

function enforceSessionGuardrails(sessionId) {
  const now = Date.now();
  const current = sessionLimitStore.get(sessionId);
  if (!current || now - current.windowStart > SESSION_LIMIT_WINDOW_MS) {
    sessionLimitStore.set(sessionId, { windowStart: now, count: 1, lastAt: now });
    return { ok: true };
  }
  if ((now - current.lastAt) < SESSION_MIN_INTERVAL_MS) {
    return { ok: false, status: 429, error: "You're sending messages too quickly. Please wait a moment." };
  }
  if (current.count >= SESSION_LIMIT_MAX) {
    return { ok: false, status: 429, error: "Session message limit reached. Please try again later." };
  }
  current.count += 1;
  current.lastAt = now;
  return { ok: true };
}

function sanitizePage(page) {
  if (!page || typeof page !== "object") return null;
  return {
    url: String(page.url || "").slice(0, 1000),
    title: String(page.title || "").slice(0, 300),
    path: String(page.path || "").slice(0, 300)
  };
}

function resolveModelRef(inputRef) {
  const requested = String(inputRef || DEFAULT_MODEL).trim();
  if (MODEL_ALLOWLIST.includes(requested)) return requested;
  return DEFAULT_MODEL;
}

function minimaxModelId(modelRef) {
  const parts = String(modelRef).split("/");
  return parts.length > 1 ? parts[1] : "MiniMax-M2.1";
}

function parseAssistantText(data) {
  const blocks = Array.isArray(data?.content) ? data.content : [];
  return blocks
    .filter((b) => b?.type === "text" && typeof b?.text === "string")
    .map((b) => b.text)
    .join("\n\n")
    .trim();
}

function buildSystemPrompt(page, messages) {
  const context = [];
  if (page?.url) context.push(`URL: ${page.url}`);
  if (page?.title) context.push(`Title: ${page.title}`);
  if (page?.path) context.push(`Path: ${page.path}`);

  const userText = latestUserMessage(messages);
  const guidanceIntent = isGuidanceIntent(userText);
  const handoffIntent = isHandoffIntent(userText);
  const currentDestination = resolveDestination(page);
  const nearbyDestinations = destinationSuggestions(currentDestination, 3);
  const snippets = conciergeSnippets({
    destination: currentDestination,
    guidanceIntent,
    handoffIntent
  });
  const knowledge = knowledgeSnippets({
    destination: currentDestination,
    page,
    userText,
    guidanceIntent
  });

  const promptLines = [
    "You are Flint, Tommy's AI assistant and concierge host for this website.",
    "Reply briefly: 1-3 short sentences and usually under 70 words unless the user explicitly asks for depth.",
    "Do not add follow-up questions, next steps, or extra suggestions unless the user explicitly asks for recommendations or navigation options.",
    "Treat the website like a hotel metaphor lightly (max 1-2 phrases per response).",
    "Be warm, concise, and practical. Default to reactive behavior: answer directly unless asked for guidance.",
    "When recommending where to go, use real page/project names and explicit real paths.",
    "Never invent rooms, pages, tools, features, or private owner information.",
    "Do not claim to read hidden page content.",
    `Guidance request detected: ${guidanceIntent ? "yes" : "no"}.`,
    `Owner handoff trigger detected: ${handoffIntent ? "yes" : "no"}.`,
    `Current destination: ${currentDestination.label} (${currentDestination.path}).`,
    userText ? `Latest user message:\n${userText.slice(0, 300)}` : "Latest user message: unavailable",
    snippets.length > 0 ? `Concierge knowledge snippets:\n${snippets.join("\n\n")}` : "Concierge knowledge snippets: unavailable",
    knowledge.length > 0 ? `Site knowledge snippets:\n${knowledge.join("\n\n")}` : "Site knowledge snippets: unavailable",
    context.length > 0 ? `Page context:\n${context.join("\n")}` : "Page context: unavailable"
  ];

  if (guidanceIntent) {
    promptLines.push(`Nearby destinations:\n${nearbyDestinations.map((destination) => `- ${destination.label}: ${destination.path}`).join("\n")}`);
  }

  return promptLines.join("\n");
}

async function callMiniMax({ modelRef, messages, page }) {
  if (!MINIMAX_API_KEY) {
    throw new Error("MINIMAX_API_KEY is not configured on the server.");
  }

  const endpoint = `${MINIMAX_BASE_URL}/v1/messages`;
  const payload = {
    model: minimaxModelId(modelRef),
    max_tokens: Number.parseInt(process.env.SITE_CHAT_MAX_TOKENS || "220", 10),
    temperature: Number.parseFloat(process.env.SITE_CHAT_TEMPERATURE || "0.2"),
    system: buildSystemPrompt(page, messages),
    messages
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${MINIMAX_API_KEY}`,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`MiniMax request failed: ${res.status} ${err.slice(0, 180)}`);
  }

  const data = await res.json();
  const text = parseAssistantText(data);
  if (!text) throw new Error("MiniMax returned an empty response.");
  return text;
}

function safeResolveStatic(urlPath) {
  const pathOnly = urlPath.split("?")[0].split("#")[0];
  const rel = pathOnly === "/" ? "index.html" : decodeURIComponent(pathOnly).replace(/^\/+/, "");
  const normalized = path.normalize(rel).replace(/^([.][.][/\\])+/, "");
  const absolute = path.join(__dirname, normalized);
  if (!absolute.startsWith(__dirname)) return null;
  return absolute;
}

function serveStatic(req, res) {
  const target = safeResolveStatic(req.url || "/");
  if (!target) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const stats = statSync(target);
    if (!stats.isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    });
    createReadStream(target).pipe(res);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

async function handleChatMessage(req, res, options = {}) {
  const { legacyShape = false } = options;

  if (!enforceRateLimit(req)) {
    sendJson(res, 429, { ok: false, error: "Rate limit exceeded. Please retry shortly." });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const sessionId = String(body?.sessionId || "").trim().slice(0, 120);
    const messages = sanitizeMessages(body?.messages);
    const page = sanitizePage(body?.page);
    const modelRef = resolveModelRef(body?.modelRef);

    if (!sessionId) {
      sendJson(res, 400, { ok: false, error: "sessionId is required" });
      return;
    }

    if (messages.length === 0 || !messages.some((m) => m.role === "user")) {
      sendJson(res, 400, { ok: false, error: "At least one user message is required" });
      return;
    }

    const sessionRule = enforceSessionGuardrails(sessionId);
    if (!sessionRule.ok) {
      sendJson(res, sessionRule.status, { ok: false, error: sessionRule.error });
      return;
    }

    const boundedMessages = trimMessagesByBudget(messages);
    const assistantText = await callMiniMax({ modelRef, messages: boundedMessages, page });
    const assistant = {
      role: "assistant",
      content: assistantText
    };

    sendJson(res, 200, legacyShape
      ? { ok: true, model: modelRef, assistantMessage: assistant }
      : { ok: true, model: modelRef, assistant });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "Unexpected server error"
    });
  }
}

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = requestUrl.pathname;
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS" && pathname.startsWith("/api/")) {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && pathname === "/api/chat/health") {
    sendJson(res, 200, {
      ok: true,
      mode: "proxy",
      provider: {
        minimaxConfigured: Boolean(MINIMAX_API_KEY),
        baseUrl: MINIMAX_BASE_URL
      },
      models: MODEL_ALLOWLIST,
      guardrails: {
        sessionLimitMax: SESSION_LIMIT_MAX,
        sessionLimitWindowMs: SESSION_LIMIT_WINDOW_MS,
        minIntervalMs: SESSION_MIN_INTERVAL_MS,
        maxContextChars: CHAT_MAX_TOTAL_CHARS
      }
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/chat/models") {
    sendJson(res, 200, {
      models: MODEL_ALLOWLIST.map((ref) => ({ ref, enabled: true }))
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/chat/message") {
    await handleChatMessage(req, res, { legacyShape: false });
    return;
  }

  if (req.method === "POST" && pathname === "/api/site-chat/chat") {
    await handleChatMessage(req, res, { legacyShape: true });
    return;
  }

  if (req.method === "POST" && pathname === "/api/site-chat/events") {
    sendJson(res, 200, { ok: true });
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  if (NODE_ENV === "production") {
    console.log("Running static server with MiniMax chat proxy.");
  }
  console.log(`AI Website server running on http://${HOST}:${PORT}`);
});
