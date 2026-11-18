import { AI_CHAT_API_BASE as DEFAULT_API_BASE } from "/snippets/ai-advisory-config.jsx";

const USER_ID = "mintlify-debug";
const API_BASE_KEY = "gn-ai-chat-api-base";

function normalizeApiBase(url) {
  return String(url || "")
    .trim()
    .replace(/\/+$/, "");
}

function readStoredApiBase() {
  try {
    const saved = localStorage.getItem(API_BASE_KEY);
    if (saved) return normalizeApiBase(saved);
  } catch (e) {}
  return normalizeApiBase(DEFAULT_API_BASE);
}

const WELCOME = {
  id: "welcome",
  role: "assistant",
  text: "你好，我是高小能。直接输入问题开始 AI 投顾调试。",
};

function parseSseBlocks(buf) {
  const events = [];
  let rest = buf;
  let sep = rest.indexOf("\n\n");
  while (sep >= 0) {
    const block = rest.slice(0, sep);
    rest = rest.slice(sep + 2);
    let eventName = "message";
    let dataLine = "";
    const lines = block.split("\n");
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith("event:")) eventName = line.slice(6).trim();
      if (line.startsWith("data:")) dataLine = line.slice(5).trim();
    }
    if (dataLine) {
      try {
        events.push({ type: eventName, data: JSON.parse(dataLine) });
      } catch (e) {}
    }
    sep = rest.indexOf("\n\n");
  }
  return { events: events, rest: rest };
}

function titleOf(session) {
  const t = session && session.title ? String(session.title).trim() : "";
  return t || "未命名会话";
}

function clip(text, n) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (s.length <= n) return s;
  return s.slice(0, n) + "…";
}

function Icon({ name }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };
  if (name === "edit") {
    return (
      <svg {...common}>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    );
  }
  if (name === "trash") {
    return (
      <svg {...common}>
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="M19 6l-1 14H6L5 6" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
      </svg>
    );
  }
  if (name === "check") {
    return (
      <svg {...common}>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }
  if (name === "close") {
    return (
      <svg {...common}>
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </svg>
    );
  }
  if (name === "copy") {
    return (
      <svg {...common}>
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15V5a2 2 0 0 1 2-2h10" />
      </svg>
    );
  }
  if (name === "quote") {
    return (
      <svg {...common}>
        <path d="M7 17h4l2-4V7H5v6h4Z" />
        <path d="M15 17h4l2-4V7h-8v6h4Z" />
      </svg>
    );
  }
  if (name === "gear") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v2.2M12 20.8V23M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M1 12h2.2M20.8 12H23M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
      </svg>
    );
  }
  return null;
}

export const AiAdvisoryChat = () => {
  const [apiBase, setApiBase] = useState(normalizeApiBase(DEFAULT_API_BASE));
  const [apiDraft, setApiDraft] = useState(normalizeApiBase(DEFAULT_API_BASE));
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [apiNote, setApiNote] = useState("");
  const [messages, setMessages] = useState([WELCOME]);
  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [quote, setQuote] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState("");
  const sessionIdRef = useRef("");
  const listRef = useRef(null);
  const idRef = useRef(1);

  const streamUrl = apiBase + "/api/ai/chat/stream";
  const sessionsUrl = apiBase + "/api/ai/sessions";

  const refreshSessions = async (base) => {
    const root = normalizeApiBase(base || apiBase);
    if (!root) return;
    try {
      const resp = await fetch(
        root + "/api/ai/sessions?userId=" + encodeURIComponent(USER_ID)
      );
      if (!resp.ok) return;
      const data = await resp.json();
      setSessions(Array.isArray(data) ? data : []);
    } catch (e) {}
  };

  useEffect(() => {
    const next = readStoredApiBase();
    setApiBase(next);
    setApiDraft(next);
  }, []);

  useEffect(() => {
    refreshSessions(apiBase);
  }, [apiBase]);

  const applyApiBase = (next, persist) => {
    const normalized = normalizeApiBase(next);
    if (!normalized) {
      setApiNote("请填写有效的 API 地址");
      return;
    }
    setApiBase(normalized);
    setApiDraft(normalized);
    setApiNote("");
    if (persist) {
      try {
        localStorage.setItem(API_BASE_KEY, normalized);
      } catch (e) {}
    }
    setShowApiSettings(false);
  };

  const resetApiBase = () => {
    const fallback = normalizeApiBase(DEFAULT_API_BASE);
    try {
      localStorage.removeItem(API_BASE_KEY);
    } catch (e) {}
    setApiBase(fallback);
    setApiDraft(fallback);
    setApiNote("");
    setShowApiSettings(false);
  };

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, thinking, busy]);

  useEffect(() => {
    const onDoc = () => setPendingDeleteId("");
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const resetChat = () => {
    if (busy) return;
    sessionIdRef.current = "";
    setActiveId("");
    setThinking("");
    setInput("");
    setQuote("");
    setEditingId("");
    setPendingDeleteId("");
    setMessages([
      Object.assign({}, WELCOME, { id: "welcome-" + Date.now() }),
    ]);
  };

  const openSession = async (session) => {
    if (!session || !session.id || busy) return;
    if (session.id === activeId && !editingId) return;
    setLoadingHistory(true);
    setThinking("");
    setInput("");
    setQuote("");
    setPendingDeleteId("");
    sessionIdRef.current = session.id;
    setActiveId(session.id);
    try {
      const resp = await fetch(
        sessionsUrl + "/" + encodeURIComponent(session.id) + "/messages"
      );
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const rows = await resp.json();
      const mapped = (Array.isArray(rows) ? rows : []).map((m, i) => ({
        id: "m-" + (m.id || i),
        role: m.role === "user" ? "user" : "assistant",
        text: m.content || "",
        source: m.source || "",
      }));
      setMessages(
        mapped.length
          ? mapped
          : [Object.assign({}, WELCOME, { id: "empty-" + session.id })]
      );
    } catch (e) {
      setMessages([
        {
          id: "err-" + Date.now(),
          role: "assistant",
          text: "加载历史失败：" + (e && e.message ? e.message : String(e)),
          source: "error",
        },
      ]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const startRename = (session, e) => {
    if (e) e.stopPropagation();
    setPendingDeleteId("");
    setEditingId(session.id);
    setEditTitle(titleOf(session));
  };

  const saveRename = async (sessionId) => {
    const next = (editTitle || "").trim();
    if (!next) {
      setEditingId("");
      return;
    }
    try {
      const resp = await fetch(
        sessionsUrl + "/" + encodeURIComponent(sessionId),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: next }),
        }
      );
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      await refreshSessions();
    } catch (e) {}
    setEditingId("");
  };

  const requestDelete = (session, e) => {
    if (e) e.stopPropagation();
    if (!session || !session.id || busy) return;
    setPendingDeleteId(session.id);
  };

  const confirmDelete = async (session, e) => {
    if (e) e.stopPropagation();
    if (!session || !session.id || busy) return;
    setPendingDeleteId("");
    try {
      const resp = await fetch(
        sessionsUrl + "/" + encodeURIComponent(session.id),
        { method: "DELETE" }
      );
      if (!resp.ok && resp.status !== 204) throw new Error("HTTP " + resp.status);
      if (sessionIdRef.current === session.id) resetChat();
      await refreshSessions();
    } catch (err) {}
  };

  const copyText = async (messageId, text) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text || "");
      } else {
        const ta = document.createElement("textarea");
        ta.value = text || "";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopiedId(messageId);
      setTimeout(() => setCopiedId(""), 1500);
    } catch (e) {}
  };

  const quoteMessage = (text) => {
    const t = (text || "").trim();
    if (!t) return;
    setQuote(t);
  };

  const ask = async (raw) => {
    const q = (raw || "").trim();
    if (!q || busy) return;
    const quoteText = (quote || "").trim();
    const sendText = quoteText
      ? "引用内容：\n---\n" + quoteText + "\n---\n\n" + q
      : q;
    const userId = "u-" + idRef.current++;
    const assistantId = "a-" + idRef.current++;
    const wasNew = !sessionIdRef.current;
    setBusy(true);
    setInput("");
    setQuote("");
    setThinking("已收到问题");
    setMessages((prev) => {
      const base =
        prev.length === 1 && String(prev[0].id).indexOf("welcome") === 0
          ? []
          : prev;
      return base.concat([
        {
          id: userId,
          role: "user",
          text: q,
          quote: quoteText || "",
        },
        { id: assistantId, role: "assistant", text: "", streaming: true },
      ]);
    });

    try {
      const resp = await fetch(streamUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
        },
        body: JSON.stringify({
          message: sendText,
          userId: USER_ID,
          sessionId: sessionIdRef.current || null,
          history: [],
        }),
      });
      if (!resp.ok || !resp.body) throw new Error("HTTP " + resp.status);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buf = "";
      let gotDelta = false;

      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buf += decoder.decode(chunk.value, { stream: true });
        const parsed = parseSseBlocks(buf);
        buf = parsed.rest;
        for (let i = 0; i < parsed.events.length; i++) {
          const ev = parsed.events[i];
          const type = ev.type || ev.data.type;
          const data = ev.data;
          if (type === "progress") {
            setThinking(data.title || "思考中…");
          } else if (type === "delta") {
            if (!gotDelta) {
              gotDelta = true;
              setThinking("");
            }
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? Object.assign({}, m, {
                      text: (m.text || "") + (data.delta || ""),
                      streaming: true,
                    })
                  : m
              )
            );
          } else if (type === "done") {
            setThinking("");
            if (data.sessionId) {
              sessionIdRef.current = data.sessionId;
              setActiveId(data.sessionId);
            }
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m;
                return Object.assign({}, m, {
                  text: m.text || data.answer || "",
                  streaming: false,
                  source: data.source,
                });
              })
            );
          } else if (type === "error") {
            setThinking("");
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? Object.assign({}, m, {
                      text: data.detail || "出错了",
                      streaming: false,
                      source: "error",
                    })
                  : m
              )
            );
          }
        }
      }

      setThinking("");
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? Object.assign({}, m, { streaming: false }) : m
        )
      );
      await refreshSessions();
      if (wasNew && sessionIdRef.current) {
        setActiveId(sessionIdRef.current);
      }
    } catch (e) {
      setThinking("");
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? Object.assign({}, m, {
                text:
                  "服务暂不可用：" +
                  (e && e.message ? e.message : String(e)) +
                  "。请确认 AI 服务与 cpolar 隧道已启动。",
                streaming: false,
                source: "error",
              })
            : m
        )
      );
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      ask(input);
    }
  };

  return (
    <div className="not-prose aic-shell">
      <style>{`
.aic-shell {
  color: inherit;
  border: 0;
  border-radius: 0;
  overflow: hidden;
  display: grid;
  grid-template-columns: var(--sidebar-width, 18rem) minmax(0, 1fr);
  justify-content: stretch;
  column-gap: 2.75rem;
  width: 100%;
  max-width: 92rem;
  margin-left: auto;
  margin-right: auto;
  min-height: 320px;
  padding-left: 2rem;
  padding-right: 2rem;
  background: transparent;
  box-sizing: border-box;
}
.aic-side {
  width: 100%;
  display: flex;
  flex-direction: column;
  background: transparent;
  min-height: 0;
  box-sizing: border-box;
}
.aic-side-head { padding: 12px 0; flex-shrink: 0; display: flex; flex-direction: column; gap: 8px; }
.aic-new-row { display: flex; gap: 8px; align-items: stretch; }
.aic-new {
  flex: 1;
  font: inherit;
  color: inherit;
  cursor: pointer;
  border: 1px solid rgba(127,127,127,.35);
  background: rgba(127,127,127,.08);
  border-radius: 10px;
  padding: 10px 12px;
  text-align: left;
  font-weight: 600;
}
.aic-new:hover { background: rgba(127,127,127,.16); }
.aic-new:disabled { opacity: .5; cursor: not-allowed; }
.aic-gear {
  width: 42px;
  flex-shrink: 0;
  border: 1px solid rgba(127,127,127,.35);
  background: rgba(127,127,127,.08);
  border-radius: 10px;
  color: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.aic-gear:hover, .aic-gear.open { background: rgba(127,127,127,.16); }
.aic-api-box {
  border: 1px solid rgba(127,127,127,.28);
  border-radius: 10px;
  padding: 10px;
  background: rgba(127,127,127,.06);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.aic-api-label {
  font-size: 12px;
  opacity: .7;
}
.aic-api-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid rgba(127,127,127,.35);
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  padding: 8px 10px;
  outline: none;
}
.aic-api-actions { display: flex; gap: 6px; }
.aic-api-btn {
  flex: 1;
  border: 1px solid rgba(127,127,127,.35);
  background: rgba(127,127,127,.08);
  border-radius: 8px;
  color: inherit;
  font: inherit;
  font-size: 12px;
  padding: 7px 8px;
  cursor: pointer;
}
.aic-api-btn.primary {
  background: rgb(var(--primary));
  border-color: transparent;
  color: #fff;
  font-weight: 600;
}
html.dark .aic-api-btn.primary {
  background: rgb(var(--primary-light));
  color: #0b1220;
}
.aic-api-note {
  font-size: 11px;
  opacity: .7;
  word-break: break-all;
}
.aic-side-label {
  padding: 8px 4px 6px;
  font-size: 12px;
  opacity: .65;
  flex-shrink: 0;
}
.aic-history {
  flex: 1;
  overflow-y: auto;
  padding: 0 0 12px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.aic-hist-row {
  position: relative;
  border-radius: 8px;
}
.aic-hist-row:hover,
.aic-hist-row.open,
.aic-hist-row.active {
  background: rgba(127,127,127,.12);
}
.aic-hist-row.active {
  box-shadow: inset 2px 0 0 rgb(var(--primary));
}
html.dark .aic-hist-row.active {
  box-shadow: inset 2px 0 0 rgb(var(--primary-light));
}
.aic-hist-main {
  font: inherit;
  color: inherit;
  cursor: pointer;
  border: 0;
  background: transparent;
  border-radius: 8px;
  padding: 9px 64px 9px 10px;
  text-align: left;
  font-size: 13px;
  line-height: 1.35;
  display: block;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.aic-hist-actions {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  display: none;
  gap: 2px;
  align-items: center;
}
.aic-hist-row:hover .aic-hist-actions,
.aic-hist-row.open .aic-hist-actions {
  display: inline-flex;
}
.aic-icon-btn {
  font: inherit;
  color: inherit;
  cursor: pointer;
  border: 0;
  background: transparent;
  border-radius: 6px;
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: .75;
  padding: 0;
}
.aic-icon-btn:hover { background: rgba(127,127,127,.2); opacity: 1; }
.aic-confirm {
  position: absolute;
  right: 4px;
  top: calc(100% - 2px);
  z-index: 5;
  display: inline-flex;
  gap: 2px;
  border: 1px solid rgba(127,127,127,.3);
  border-radius: 8px;
  background: rgba(20,24,32,.96);
  box-shadow: 0 8px 24px rgba(0,0,0,.35);
  padding: 4px;
}
html:not(.dark) .aic-confirm {
  background: #fff;
  color: #111;
}
.aic-icon-btn.danger { color: #f87171; }
.aic-edit-box {
  display: flex;
  gap: 4px;
  padding: 4px;
}
.aic-edit-input {
  flex: 1;
  font: inherit;
  color: inherit;
  border: 1px solid rgba(127,127,127,.35);
  border-radius: 6px;
  background: transparent;
  padding: 6px 8px;
  min-width: 0;
}
.aic-hist-empty {
  padding: 10px 4px;
  font-size: 12px;
  opacity: .55;
}
.aic-main {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
}
.aic-list {
  flex: 1;
  overflow-y: auto;
  padding: 20px 0 8px;
  min-height: 0;
  width: 100%;
  max-width: 49.5rem;
  box-sizing: border-box;
}
.aic-thread {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-sizing: border-box;
}
.aic-row { display: flex; width: 100%; }
.aic-row.user { justify-content: flex-end; }
.aic-row.assistant { justify-content: flex-start; }
.aic-msg {
  max-width: 100%;
  min-width: 0;
}
.aic-bubble {
  max-width: 100%;
  padding: 10px 14px;
  border-radius: 14px;
  white-space: pre-wrap;
  line-height: 1.6;
  font-size: 14px;
  word-break: break-word;
}
.aic-row.user .aic-bubble {
  background: rgb(var(--primary));
  color: #fff;
  border-bottom-right-radius: 4px;
}
html.dark .aic-row.user .aic-bubble {
  background: rgb(var(--primary-light));
  color: #0b1220;
}
.aic-row.assistant .aic-bubble {
  background: rgba(127,127,127,.12);
  border-bottom-left-radius: 4px;
}
.aic-quote-tag {
  font-size: 12px;
  opacity: .75;
  margin-bottom: 6px;
  padding: 6px 8px;
  border-left: 2px solid rgba(127,127,127,.45);
  background: rgba(127,127,127,.08);
  border-radius: 0 6px 6px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
}
.aic-meta {
  font-size: 12px;
  opacity: .65;
  margin-top: 4px;
}
.aic-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  margin-top: 8px;
}
.aic-act {
  font: inherit;
  color: inherit;
  cursor: pointer;
  border: 0;
  background: transparent;
  border-radius: 6px;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: .72;
  padding: 0;
}
.aic-act:hover { background: rgba(127,127,127,.14); opacity: 1; }
.aic-act.ok { color: #34d399; opacity: 1; }
.aic-thinking {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  opacity: .78;
}
.aic-spinner {
  width: 10px;
  height: 10px;
  border: 2px solid rgba(127,127,127,.35);
  border-top-color: rgb(var(--primary));
  border-radius: 50%;
  animation: aic-spin .7s linear infinite;
}
html.dark .aic-spinner { border-top-color: rgb(var(--primary-light)); }
.aic-cursor::after {
  content: "▍";
  animation: aic-blink 1s step-end infinite;
  color: rgb(var(--primary));
}
html.dark .aic-cursor::after { color: rgb(var(--primary-light)); }
.aic-composer {
  border: 0;
  padding: 8px 0 20px;
  background: transparent;
  flex-shrink: 0;
  width: 100%;
  max-width: 49.5rem;
  box-sizing: border-box;
}
.aic-composer-inner { width: 100%; box-sizing: border-box; }
.aic-quote-bar {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(127,127,127,.1);
  border-left: 3px solid rgb(var(--primary));
  font-size: 12px;
  line-height: 1.45;
}
html.dark .aic-quote-bar {
  border-left-color: rgb(var(--primary-light));
}
.aic-quote-bar-text {
  flex: 1;
  min-width: 0;
  max-height: 4.2em;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-word;
  opacity: .85;
}
.aic-box {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  border: 1px solid rgba(127,127,127,.32);
  border-radius: 14px;
  padding: 8px;
  background: rgba(127,127,127,.06);
  width: 100%;
  box-sizing: border-box;
}
.aic-input {
  flex: 1;
  border: 0;
  resize: none;
  outline: none;
  min-height: 44px;
  max-height: 140px;
  font: inherit;
  color: inherit;
  padding: 8px;
  background: transparent;
}
.aic-send {
  border: 0;
  border-radius: 10px;
  background: rgb(var(--primary));
  color: #fff;
  padding: 10px 14px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
html.dark .aic-send {
  background: rgb(var(--primary-light));
  color: #0b1220;
}
.aic-send:disabled { opacity: .5; cursor: not-allowed; }
@media (max-width: 900px) {
  .aic-shell {
    grid-template-columns: 12rem minmax(0, 1fr);
    column-gap: 1.25rem;
    padding-left: 1rem;
    padding-right: 1rem;
    max-width: none;
  }
}
@keyframes aic-spin { to { transform: rotate(360deg); } }
@keyframes aic-blink { 50% { opacity: 0; } }
      `}</style>

      <aside className="aic-side">
        <div className="aic-side-head">
          <div className="aic-new-row">
            <button
              type="button"
              className="aic-new"
              onClick={resetChat}
              disabled={busy}
            >
              ＋ 新会话
            </button>
            <button
              type="button"
              className={"aic-gear" + (showApiSettings ? " open" : "")}
              title="API 地址"
              aria-label="API 地址"
              onClick={() => {
                setApiDraft(apiBase);
                setApiNote("");
                setShowApiSettings(!showApiSettings);
              }}
            >
              <Icon name="gear" />
            </button>
          </div>
          {showApiSettings ? (
            <div className="aic-api-box">
              <div className="aic-api-label">AI API（cpolar 日更时可临时覆盖）</div>
              <input
                className="aic-api-input"
                value={apiDraft}
                placeholder="https://xxxx.r9.cpolar.cn"
                onChange={(e) => setApiDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyApiBase(apiDraft, true);
                  }
                  if (e.key === "Escape") setShowApiSettings(false);
                }}
              />
              <div className="aic-api-actions">
                <button
                  type="button"
                  className="aic-api-btn primary"
                  onClick={() => applyApiBase(apiDraft, true)}
                >
                  保存
                </button>
                <button
                  type="button"
                  className="aic-api-btn"
                  onClick={resetApiBase}
                >
                  恢复默认
                </button>
              </div>
              <div className="aic-api-note">
                {apiNote || "当前：" + apiBase}
              </div>
            </div>
          ) : null}
        </div>
        <div className="aic-side-label">历史会话</div>
        <div className="aic-history">
          {sessions.length === 0 ? (
            <div className="aic-hist-empty">暂无历史，发送一条消息后会出现在这里</div>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                className={
                  "aic-hist-row" +
                  (s.id === activeId ? " active" : "") +
                  (pendingDeleteId === s.id ? " open" : "")
                }
              >
                {editingId === s.id ? (
                  <div className="aic-edit-box">
                    <input
                      className="aic-edit-input"
                      value={editTitle}
                      autoFocus
                      onChange={(e) => setEditTitle(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          saveRename(s.id);
                        }
                        if (e.key === "Escape") setEditingId("");
                      }}
                    />
                    <button
                      type="button"
                      className="aic-icon-btn"
                      title="保存"
                      aria-label="保存"
                      onClick={(e) => {
                        e.stopPropagation();
                        saveRename(s.id);
                      }}
                    >
                      <Icon name="check" />
                    </button>
                    <button
                      type="button"
                      className="aic-icon-btn"
                      title="取消"
                      aria-label="取消"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId("");
                      }}
                    >
                      <Icon name="close" />
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      className="aic-hist-main"
                      title={titleOf(s)}
                      disabled={busy || loadingHistory}
                      onClick={() => openSession(s)}
                    >
                      {titleOf(s)}
                    </button>
                    <div className="aic-hist-actions">
                      <button
                        type="button"
                        className="aic-icon-btn"
                        title="重命名"
                        aria-label="重命名"
                        onClick={(e) => startRename(s, e)}
                      >
                        <Icon name="edit" />
                      </button>
                      <button
                        type="button"
                        className="aic-icon-btn danger"
                        title="删除"
                        aria-label="删除"
                        onClick={(e) => requestDelete(s, e)}
                      >
                        <Icon name="trash" />
                      </button>
                    </div>
                    {pendingDeleteId === s.id ? (
                      <div className="aic-confirm" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="aic-icon-btn danger"
                          title="确认删除"
                          aria-label="确认删除"
                          onClick={(e) => confirmDelete(s, e)}
                        >
                          <Icon name="check" />
                        </button>
                        <button
                          type="button"
                          className="aic-icon-btn"
                          title="取消"
                          aria-label="取消"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingDeleteId("");
                          }}
                        >
                          <Icon name="close" />
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </aside>

      <div className="aic-main">
        <div className="aic-list" ref={listRef}>
          <div className="aic-thread">
            {loadingHistory ? (
              <div className="aic-row assistant">
                <div className="aic-thinking">
                  <span className="aic-spinner" aria-hidden="true" />
                  <span>加载历史…</span>
                </div>
              </div>
            ) : null}
            {!loadingHistory
              ? messages.map((m) => (
                  <div key={m.id} className={"aic-row " + m.role}>
                    <div className="aic-msg">
                      {m.quote ? (
                        <div className="aic-quote-tag" title={m.quote}>
                          <Icon name="quote" /> {clip(m.quote, 48)}
                        </div>
                      ) : null}
                      <div
                        className={
                          "aic-bubble" +
                          (m.streaming && m.role === "assistant"
                            ? " aic-cursor"
                            : "")
                        }
                      >
                        {m.text}
                      </div>
                      {m.source ? (
                        <div className="aic-meta">来源：{m.source}</div>
                      ) : null}
                      {m.role === "assistant" && m.text && !m.streaming ? (
                        <div className="aic-actions">
                          <button
                            type="button"
                            className={"aic-act" + (copiedId === m.id ? " ok" : "")}
                            title={copiedId === m.id ? "已复制" : "复制"}
                            aria-label={copiedId === m.id ? "已复制" : "复制"}
                            onClick={() => copyText(m.id, m.text)}
                          >
                            <Icon name={copiedId === m.id ? "check" : "copy"} />
                          </button>
                          <button
                            type="button"
                            className="aic-act"
                            title="引用"
                            aria-label="引用"
                            onClick={() => quoteMessage(m.text)}
                          >
                            <Icon name="quote" />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))
              : null}
            {thinking ? (
              <div className="aic-row assistant">
                <div className="aic-thinking">
                  <span className="aic-spinner" aria-hidden="true" />
                  <span>{thinking}</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="aic-composer">
          <div className="aic-composer-inner">
            {quote ? (
              <div className="aic-quote-bar">
                <div className="aic-quote-bar-text">{clip(quote, 180)}</div>
                <button
                  type="button"
                  className="aic-icon-btn"
                  title="取消引用"
                  aria-label="取消引用"
                  onClick={() => setQuote("")}
                >
                  <Icon name="close" />
                </button>
              </div>
            ) : null}
            <div className="aic-box">
              <textarea
                className="aic-input"
                value={input}
                disabled={busy || loadingHistory}
                placeholder="输入问题，Enter 发送，Shift+Enter 换行"
                rows={2}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
              />
              <button
                type="button"
                className="aic-send"
                disabled={busy || loadingHistory || !input.trim()}
                onClick={() => ask(input)}
              >
                发送
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
