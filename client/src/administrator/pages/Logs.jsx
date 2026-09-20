import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  Activity,
  LogIn,
  MessageSquare,
  Flag,
  Search,
  X,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import moment from "moment";
import {
  fetchAuditLogs,
  fetchLoginEvents,
  fetchChatLogs,
  fetchChatLog,
  clearSelectedChat,
} from "../../redux/slices/adminLogSlice";
import AdminTable, { AdminTableRow, AdminTableCell } from "../components/AdminTable";
import LoadingSkeleton from "../components/LoadingSkeleton";
import EmptyState from "../components/EmptyState";
import Pagination from "../components/Pagination";
import { getPalette } from "../utils/palette";

const PAGE_SIZE = 25;

const TABS = [
  { key: "audit", label: "Audit", icon: Activity },
  { key: "logins", label: "Logins", icon: LogIn },
  { key: "chats", label: "Chats", icon: MessageSquare },
];

const Logs = () => {
  const dispatch = useDispatch();
  const theme = useSelector((s) => s.theme.theme);
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const C = getPalette(theme === "dark", tenantBranding);
  const { audit, logins, chats, selectedChat, selectedUser, chatLoading } = useSelector(
    (s) => s.adminLog
  );

  const [tab, setTab] = useState("audit");
  const [search, setSearch] = useState("");
  const [loginFilter, setLoginFilter] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    const offset = (page - 1) * PAGE_SIZE;
    if (tab === "audit") {
      dispatch(fetchAuditLogs({ search, limit: PAGE_SIZE, offset }));
    } else if (tab === "logins") {
      dispatch(fetchLoginEvents({ email: search, success: loginFilter, limit: PAGE_SIZE, offset }));
    } else if (tab === "chats") {
      dispatch(fetchChatLogs({ search, flaggedOnly, limit: PAGE_SIZE, offset }));
    }
  }, [dispatch, tab, search, loginFilter, flaggedOnly, page]);

  useEffect(() => { setPage(1); setSearch(""); }, [tab]);

  const openChat = (id) => {
    setChatOpen(true);
    dispatch(fetchChatLog(id));
  };
  const closeChat = () => {
    setChatOpen(false);
    dispatch(clearSelectedChat());
  };

  const renderAudit = () => (
    <AdminTable
      columns={[
        { key: "when", label: "When" },
        { key: "actor", label: "Actor" },
        { key: "action", label: "Action" },
        { key: "target", label: "Target" },
        { key: "status", label: "Status" },
      ]}
    >
      {audit.loading ? (
        <LoadingSkeleton cols={5} />
      ) : audit.items.length === 0 ? (
        <tbody>
          <tr><td colSpan={5}>
            <EmptyState icon={Activity} title="No audit entries" description="Admin actions will appear here." />
          </td></tr>
        </tbody>
      ) : (
        <tbody>
          {audit.items.map((a) => (
            <AdminTableRow key={a._id}>
              <AdminTableCell>
                <span className="text-xs" style={{ color: C.muted }}>
                  {moment(a.createdAt).format("MMM D, HH:mm:ss")}
                </span>
              </AdminTableCell>
              <AdminTableCell>
                <span style={{ color: C.text }}>{a.actorEmail}</span>
                {a.impersonatedBySuperAdminEmail && (
                  <span
                    className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                    style={{ backgroundColor: `${C.amber}22`, color: C.amber }}
                    title={`Performed by Super Admin ${a.impersonatedBySuperAdminEmail} while impersonating this Administrator`}
                  >
                    via Super Admin
                  </span>
                )}
              </AdminTableCell>
              <AdminTableCell>
                <span className="font-mono text-xs" style={{ color: C.text }}>
                  {a.method} {a.path}
                </span>
              </AdminTableCell>
              <AdminTableCell>
                <span className="font-mono text-xs" style={{ color: C.muted }}>
                  {a.targetType}{a.targetId ? `/${a.targetId}` : ""}
                </span>
              </AdminTableCell>
              <AdminTableCell>
                <span
                  className="px-2 py-0.5 text-xs rounded-full font-medium"
                  style={{
                    backgroundColor: a.statusCode < 300 ? `${C.green}1A` : `${C.red}1A`,
                    color: a.statusCode < 300 ? C.green : C.red,
                  }}
                >
                  {a.statusCode}
                </span>
              </AdminTableCell>
            </AdminTableRow>
          ))}
        </tbody>
      )}
    </AdminTable>
  );

  const renderLogins = () => (
    <AdminTable
      columns={[
        { key: "when", label: "When" },
        { key: "email", label: "Email" },
        { key: "status", label: "Status" },
        { key: "reason", label: "Reason" },
        { key: "ip", label: "IP / Agent" },
      ]}
    >
      {logins.loading ? (
        <LoadingSkeleton cols={5} />
      ) : logins.items.length === 0 ? (
        <tbody>
          <tr><td colSpan={5}>
            <EmptyState icon={LogIn} title="No login events" description="Login attempts will appear here." />
          </td></tr>
        </tbody>
      ) : (
        <tbody>
          {logins.items.map((l) => (
            <AdminTableRow key={l._id}>
              <AdminTableCell>
                <span className="text-xs" style={{ color: C.muted }}>
                  {moment(l.createdAt).format("MMM D, HH:mm:ss")}
                </span>
              </AdminTableCell>
              <AdminTableCell>
                <span style={{ color: C.text }}>{l.email}</span>
              </AdminTableCell>
              <AdminTableCell>
                {l.success ? (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full"
                    style={{ backgroundColor: `${C.green}1A`, color: C.green }}
                  >
                    <CheckCircle2 className="w-3 h-3" /> Success
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full"
                    style={{ backgroundColor: `${C.red}1A`, color: C.red }}
                  >
                    <XCircle className="w-3 h-3" /> Failed
                  </span>
                )}
              </AdminTableCell>
              <AdminTableCell>
                <span className="text-xs" style={{ color: C.muted }}>{l.reason || "—"}</span>
              </AdminTableCell>
              <AdminTableCell>
                <span className="text-xs" style={{ color: C.muted }}>
                  {l.ip || "—"}
                </span>
                {l.userAgent && (
                  <p className="text-xs truncate max-w-[200px]" style={{ color: C.muted, opacity: 0.7 }}>
                    {l.userAgent}
                  </p>
                )}
              </AdminTableCell>
            </AdminTableRow>
          ))}
        </tbody>
      )}
    </AdminTable>
  );

  const renderChats = () => (
    <AdminTable
      columns={[
        { key: "student", label: "Student" },
        { key: "title", label: "Chat" },
        { key: "messages", label: "Msgs" },
        { key: "preview", label: "Last message" },
        { key: "updated", label: "Updated" },
      ]}
    >
      {chats.loading ? (
        <LoadingSkeleton cols={5} />
      ) : chats.items.length === 0 ? (
        <tbody>
          <tr><td colSpan={5}>
            <EmptyState icon={MessageSquare} title="No chats" description="No conversations match these filters." />
          </td></tr>
        </tbody>
      ) : (
        <tbody>
          {chats.items.map((c) => (
            <AdminTableRow key={c._id} onClick={() => openChat(c._id)}>
              <AdminTableCell>
                <span style={{ color: C.text }}>{c.userName}</span>
              </AdminTableCell>
              <AdminTableCell>
                <span className="font-medium" style={{ color: C.text }}>{c.name}</span>
              </AdminTableCell>
              <AdminTableCell>
                <span className="text-xs" style={{ color: C.muted }}>{c.messageCount}</span>
              </AdminTableCell>
              <AdminTableCell>
                <p className="text-xs line-clamp-1 max-w-[280px]" style={{ color: C.muted }}>
                  {c.lastMessage || "—"}
                </p>
              </AdminTableCell>
              <AdminTableCell>
                <span className="text-xs" style={{ color: C.muted }}>{moment(c.updatedAt).fromNow()}</span>
              </AdminTableCell>
            </AdminTableRow>
          ))}
        </tbody>
      )}
    </AdminTable>
  );

  const totalForTab = tab === "audit" ? audit.total : tab === "logins" ? logins.total : chats.total;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="px-3 py-2 text-sm rounded-lg border flex items-center gap-2 transition-colors"
              style={{
                backgroundColor: active ? C.navy : C.surface,
                color: active ? "#fff" : C.text,
                borderColor: active ? C.navy : C.border,
              }}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: C.muted }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              tab === "audit"
                ? "Filter by action (e.g. POST)..."
                : tab === "logins"
                ? "Filter by email..."
                : "Filter by student name or email..."
            }
            className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border focus:outline-none"
            style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
          />
        </div>
        {tab === "logins" && (
          <select
            value={loginFilter}
            onChange={(e) => setLoginFilter(e.target.value)}
            className="px-3 py-2.5 text-sm rounded-lg border focus:outline-none"
            style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
          >
            <option value="">All</option>
            <option value="true">Success only</option>
            <option value="false">Failed only</option>
          </select>
        )}
        {tab === "chats" && (
          <label className="flex items-center gap-2 text-sm" style={{ color: C.text }}>
            <input
              type="checkbox"
              checked={flaggedOnly}
              onChange={(e) => setFlaggedOnly(e.target.checked)}
            />
            <Flag className="w-3 h-3" style={{ color: C.red }} />
            Flagged students only
          </label>
        )}
      </div>

      {tab === "audit" && renderAudit()}
      {tab === "logins" && renderLogins()}
      {tab === "chats" && renderChats()}

      <Pagination page={page} pageSize={PAGE_SIZE} total={totalForTab} onChange={setPage} />

      {chatOpen && (
        <div className="fixed inset-0 z-50 flex" onClick={closeChat}>
          <div className="flex-1" style={{ backgroundColor: "rgba(15, 22, 38, 0.5)" }} />
          <aside
            className="w-full sm:w-[560px] h-full overflow-y-auto border-l"
            style={{ backgroundColor: C.surface, borderColor: C.border }}
            onClick={(e) => e.stopPropagation()}
          >
            <header
              className="px-5 py-4 border-b flex items-center justify-between sticky top-0 z-10"
              style={{ borderColor: C.border, backgroundColor: C.surface }}
            >
              <h2 className="text-base font-semibold" style={{ color: C.text }}>
                Conversation
              </h2>
              <button onClick={closeChat} className="p-1 rounded" style={{ color: C.muted }}>
                <X className="w-5 h-5" />
              </button>
            </header>
            <div className="p-5 space-y-3">
              {chatLoading && <p className="text-sm" style={{ color: C.muted }}>Loading...</p>}
              {selectedUser && (
                <div className="p-3 rounded-lg border" style={{ borderColor: C.border, backgroundColor: C.surfaceAlt }}>
                  <p className="text-sm font-medium flex items-center gap-2" style={{ color: C.text }}>
                    {selectedUser.name}
                    {selectedUser.flags?.length > 0 && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full font-medium"
                        style={{ backgroundColor: `${C.red}1A`, color: C.red }}
                      >
                        <Flag className="w-3 h-3" /> {selectedUser.flags.length} flag(s)
                      </span>
                    )}
                  </p>
                  <p className="text-xs" style={{ color: C.muted }}>{selectedUser.email}</p>
                </div>
              )}
              {(selectedChat?.messages || []).map((m, idx) => {
                const isUser = m.role === "user";
                return (
                  <div
                    key={idx}
                    className="p-3 rounded-lg border text-sm"
                    style={{
                      borderColor: C.border,
                      backgroundColor: isUser ? C.surfaceAlt : `${C.navy}10`,
                    }}
                  >
                    <div className="flex items-center justify-between mb-1 text-xs" style={{ color: C.muted }}>
                      <span className="font-medium">{isUser ? "Student" : "Bot"}</span>
                      <span>{m.timestamp ? moment(m.timestamp).format("MMM D HH:mm:ss") : ""}</span>
                    </div>
                    <p style={{ color: C.text }}>{m.content}</p>
                  </div>
                );
              })}
              {selectedChat && (!selectedChat.messages || selectedChat.messages.length === 0) && (
                <p className="text-sm" style={{ color: C.muted }}>This conversation is empty.</p>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};

export default Logs;
