const API_BASE = "https://253f41f2.r9.cpolar.cn";
const STREAM_URL = API_BASE + "/api/ai/chat/stream";
const SESSIONS_URL = API_BASE + "/api/ai/sessions";
const USER_ID = "mintlify-debug";

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

export const AiAdvisoryChat = () => {
  const [messages, setMessages] = useState([WELCOME]);
  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const sessionIdRef = useRef("");
  const listRef = useRef(null);
  const idRef = useRef(1);

  const refreshSessions = async () => {
    try {
      const resp = await fetch(
        SESSIONS_URL + "?userId=" + encodeURIComponent(USER_ID)
      );
      if (!resp.ok) return;
      const data = await resp.json();
      setSessions(Array.isArray(data) ? data : []);
    } catch (e) {}
  };

  useEffect(() => {
    refreshSessions();
  }, []);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, thinking, busy]);

  const resetChat = () => {
    if (busy) return;
    sessionIdRef.current = "";
    setActiveId("");
    setThinking("");
    setInput("");
    setMessages([
      Object.assign({}, WELCOME, { id: "welcome-" + Date.now() }),
    ]);
  };

  const openSession = async (session) => {
    if (!session || !session.id || busy) return;
    if (session.id === activeId) return;
    setLoadingHistory(true);
    setThinking("");
    setInput("");
    sessionIdRef.current = session.id;
    setActiveId(session.id);
    try {
      const resp = await fetch(
        SESSIONS_URL + "/" + encodeURIComponent(session.id) + "/messages"
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

  const ask = async (raw) => {
    const q = (raw || "").trim();
    if (!q || busy) return;
    const userId = "u-" + idRef.current++;
    const assistantId = "a-" + idRef.current++;
    const wasNew = !sessionIdRef.current;
    setBusy(true);
    setInput("");
    setThinking("已收到问题");
    setMessages((prev) => {
      const base =
        prev.length === 1 && String(prev[0].id).indexOf("welcome") === 0
          ? []
          : prev;
      return base.concat([
        { id: userId, role: "user", text: q },
        { id: assistantId, role: "assistant", text: "", streaming: true },
      ]);
    });

    try {
      const resp = await fetch(STREAM_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
        },
        body: JSON.stringify({
          message: q,
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
                  "。请确认 AI 服务已在本机 8088 启动。",
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
  grid-template-columns: var(--sidebar-width, 18rem) minmax(0, 49.5rem);
  justify-content: start;
  column-gap: 2.75rem;
  width: 100%;
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
  border-right: 0;
  background: transparent;
  min-height: 0;
  box-sizing: border-box;
}
.aic-side-head {
  padding: 12px 14px;
  flex-shrink: 0;
}
.aic-new {
  width: 100%;
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
.aic-side-label {
  padding: 12px 14px 6px;
  font-size: 12px;
  opacity: .65;
  flex-shrink: 0;
}
.aic-history {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px 12px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.aic-hist-item {
  font: inherit;
  color: inherit;
  cursor: pointer;
  border: 0;
  background: transparent;
  border-radius: 8px;
  padding: 9px 10px;
  text-align: left;
  font-size: 13px;
  line-height: 1.35;
  display: block;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.aic-hist-item:hover { background: rgba(127,127,127,.12); }
.aic-hist-item.active {
  background: rgba(59,130,246,.16);
  box-shadow: inset 2px 0 0 rgb(var(--primary));
}
html.dark .aic-hist-item.active {
  box-shadow: inset 2px 0 0 rgb(var(--primary-light));
}
.aic-hist-empty {
  padding: 10px;
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
  box-sizing: border-box;
}
.aic-thread {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
}
.aic-row { display: flex; width: 100%; }
.aic-row.user { justify-content: flex-end; }
.aic-row.assistant { justify-content: flex-start; }
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
.aic-meta {
  font-size: 12px;
  opacity: .65;
  margin-top: 4px;
}
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
html.dark .aic-spinner {
  border-top-color: rgb(var(--primary-light));
}
.aic-cursor::after {
  content: "▍";
  animation: aic-blink 1s step-end infinite;
  color: rgb(var(--primary));
}
html.dark .aic-cursor::after {
  color: rgb(var(--primary-light));
}
.aic-composer {
  border: 0;
  padding: 8px 0 20px;
  background: transparent;
  flex-shrink: 0;
  width: 100%;
  box-sizing: border-box;
}
.aic-composer-inner {
  width: 100%;
  box-sizing: border-box;
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
  }
}
@keyframes aic-spin { to { transform: rotate(360deg); } }
@keyframes aic-blink { 50% { opacity: 0; } }
      `}</style>

      <aside className="aic-side">
        <div className="aic-side-head">
          <button
            type="button"
            className="aic-new"
            onClick={resetChat}
            disabled={busy}
          >
            ＋ 新会话
          </button>
        </div>
        <div className="aic-side-label">历史会话</div>
        <div className="aic-history">
          {sessions.length === 0 ? (
            <div className="aic-hist-empty">暂无历史，发送一条消息后会出现在这里</div>
          ) : (
            sessions.map((s) => (
              <button
                key={s.id}
                type="button"
                className={
                  "aic-hist-item" + (s.id === activeId ? " active" : "")
                }
                title={titleOf(s)}
                disabled={busy || loadingHistory}
                onClick={() => openSession(s)}
              >
                {titleOf(s)}
              </button>
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
                    <div>
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
