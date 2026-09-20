import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  ArrowLeft,
  Send,
  FileText,
  Image as ImageIcon,
  Clock,
  User,
  X,
  UserPlus,
  AlertTriangle,
  Download,
} from "lucide-react";
import moment from "moment";
import toast from "react-hot-toast";
import {
  fetchDeptIssueById,
  addStaffReply,
  updateIssueStatus,
  assignIssue,
  fetchDeptStaff,
  clearSelectedIssue,
} from "../../redux/slices/issueSlice";
import { getPalette } from "../../administrator/utils/palette";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3000";
const STATUSES = ["Pending", "In Progress", "Resolved", "Closed", "Rejected"];
const POLL_MS = 20000;

const statusStyle = (status, isDark) => {
  const palette = {
    Pending: { bg: isDark ? "#3a2f15" : "#FFF4E0", text: isDark ? "#FFC774" : "#9A6B00" },
    "In Progress": { bg: isDark ? "#13314f" : "#E0F0FF", text: isDark ? "#7BB6F5" : "#1463B0" },
    Resolved: { bg: isDark ? "#163320" : "#E0F8E5", text: isDark ? "#7BD594" : "#1B7A33" },
    Closed: { bg: isDark ? "#2a2a2a" : "#EDEDED", text: isDark ? "#B5B5B5" : "#666666" },
    Rejected: { bg: isDark ? "#3a1818" : "#FCE6E6", text: isDark ? "#F08D7B" : "#A8261B" },
  };
  return palette[status] || palette.Closed;
};

const isImage = (mt) => (mt || "").startsWith("image/");
const isPdf = (mt) => mt === "application/pdf";

// ---------------------------------------------------------------------------
// Attachment preview modal — image lightbox + PDF iframe
// ---------------------------------------------------------------------------

const AttachmentModal = ({ attachment, onClose, C }) => {
  if (!attachment) return null;
  const url = `${SERVER_URL}${attachment.url}`;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl max-h-[90vh] rounded-xl overflow-hidden flex flex-col"
        style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: C.border }}>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate" style={{ color: C.text }}>{attachment.originalName}</p>
            <p className="text-xs" style={{ color: C.muted }}>
              {attachment.mimeType} · {(attachment.size / 1024).toFixed(0)} KB
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={url}
              download={attachment.originalName}
              className="p-2 rounded-lg border text-sm inline-flex items-center gap-1"
              style={{ borderColor: C.border, color: C.text }}
            >
              <Download className="w-4 h-4" /> Download
            </a>
            <button
              onClick={onClose}
              className="p-2 rounded-lg border"
              style={{ borderColor: C.border, color: C.text }}
              aria-label="Close preview"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto flex items-center justify-center" style={{ backgroundColor: C.surfaceAlt }}>
          {isImage(attachment.mimeType) ? (
            <img src={url} alt={attachment.originalName} className="max-w-full max-h-[80vh] object-contain" />
          ) : isPdf(attachment.mimeType) ? (
            <iframe src={url} title={attachment.originalName} className="w-full h-[80vh] bg-white" />
          ) : (
            <div className="p-8 text-center text-sm" style={{ color: C.muted }}>
              Preview not available for this file type.<br />Use the Download button above.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Assignee strip — shows who owns the issue + Assign-to-me / Reassign
// ---------------------------------------------------------------------------

const AssigneeStrip = ({ issue, currentUser, deptStaff, onAssign, busy, C }) => {
  const [picking, setPicking] = useState(false);
  const assignee = issue.assignedTo;
  const mine = assignee && assignee._id === currentUser?._id;

  return (
    <div
      className="flex items-center gap-3 flex-wrap p-3 rounded-lg border"
      style={{ backgroundColor: C.surfaceAlt, borderColor: C.border }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <UserPlus className="w-4 h-4" style={{ color: C.muted }} />
        <span className="text-xs uppercase font-semibold" style={{ color: C.muted }}>Assignee:</span>
        {assignee ? (
          <span className="text-sm font-medium truncate" style={{ color: C.text }}>
            {assignee.name}
            {assignee.staffTitle && (
              <span className="text-xs ml-1" style={{ color: C.muted }}>· {assignee.staffTitle}</span>
            )}
            {mine && (
              <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ backgroundColor: C.navy, color: "#fff" }}>
                YOU
              </span>
            )}
          </span>
        ) : (
          <span className="text-sm" style={{ color: C.muted }}>Unassigned</span>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {!mine && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAssign(currentUser._id)}
            className="px-2.5 py-1 rounded-lg border text-xs font-medium disabled:opacity-50"
            style={{ borderColor: C.border, color: C.text }}
          >
            Assign to me
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => setPicking((p) => !p)}
          className="px-2.5 py-1 rounded-lg border text-xs font-medium disabled:opacity-50"
          style={{ borderColor: C.border, color: C.text }}
        >
          {picking ? "Cancel" : "Reassign…"}
        </button>
      </div>

      {picking && (
        <div className="basis-full pt-2 mt-1 border-t flex flex-wrap gap-2" style={{ borderColor: C.border }}>
          <button
            type="button"
            onClick={() => { onAssign(null); setPicking(false); }}
            className="px-2.5 py-1 rounded-lg border text-xs"
            style={{ borderColor: C.border, color: C.muted }}
          >
            Unassign
          </button>
          {deptStaff
            .filter((s) => s._id !== assignee?._id)
            .map((s) => (
              <button
                key={s._id}
                type="button"
                onClick={() => { onAssign(s._id); setPicking(false); }}
                className="px-2.5 py-1 rounded-lg border text-xs"
                style={{ borderColor: C.border, color: C.text }}
              >
                {s.name}{s.staffTitle ? ` · ${s.staffTitle}` : ""}
              </button>
            ))}
          {deptStaff.length === 0 && (
            <span className="text-xs" style={{ color: C.muted }}>No other staff in this department.</span>
          )}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main detail view
// ---------------------------------------------------------------------------

const StaffIssueDetail = () => {
  const { id } = useParams();
  const dispatch = useDispatch();
  const issue = useSelector((s) => s.issue.selectedIssue);
  const deptStaff = useSelector((s) => s.issue.deptStaff);
  const theme = useSelector((s) => s.theme.theme);
  const user = useSelector((s) => s.auth.user);
  const isDark = theme === "dark";
  const tenantBranding = useSelector((s) => s.tenant.branding);

  // Composer state
  const [reply, setReply] = useState("");
  const [pendingStatus, setPendingStatus] = useState(null); // null = no status change in this submission
  const [rejectReason, setRejectReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Assignment state
  const [assignBusy, setAssignBusy] = useState(false);

  // Preview modal
  const [previewAtt, setPreviewAtt] = useState(null);

  // Track the version we last interacted with so we can warn on poll-detected
  // changes made by someone else.
  const seenVersionRef = useRef(null);

  const C = getPalette(isDark, tenantBranding);

  // Initial fetch + 20s polling + staff list for reassign dropdown
  useEffect(() => {
    dispatch(fetchDeptIssueById(id));
    dispatch(fetchDeptStaff());
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") dispatch(fetchDeptIssueById(id));
    }, POLL_MS);
    return () => {
      clearInterval(interval);
      dispatch(clearSelectedIssue());
    };
  }, [dispatch, id]);

  // Live-update detection: if the polled version differs and the last event
  // was someone *else*, surface a non-blocking toast and update our baseline.
  useEffect(() => {
    if (!issue) return;
    const v = new Date(issue.updatedAt).toISOString();
    if (seenVersionRef.current && seenVersionRef.current !== v) {
      const ev = issue.lastEvent;
      const byMe = ev?.byUserId && ev.byUserId._id
        ? ev.byUserId._id === user?._id
        : false;
      if (!byMe && ev?.byName) {
        const what =
          ev.type === "status" ? `updated status (${ev.note || "changed"})` :
          ev.type === "reply"  ? "added a reply" :
          ev.type === "assign" ? `reassigned (${ev.note || ""})` :
          "made changes";
        toast(`${ev.byName} ${what}`, { icon: "🔄", duration: 4000 });
      }
    }
    seenVersionRef.current = v;
  }, [issue, user]);

  const handleAssign = async (assigneeId) => {
    if (!issue) return;
    setAssignBusy(true);
    const result = await dispatch(assignIssue({
      id,
      assigneeId,
      expectedUpdatedAt: issue.updatedAt,
    })).unwrap();
    setAssignBusy(false);
    if (result.conflict) {
      toast.error(result.message);
    } else if (result.success) {
      toast.success(assigneeId ? "Assigned" : "Unassigned");
    } else {
      toast.error(result.message || "Failed to reassign");
    }
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!issue) return;
    const hasReply = reply.trim().length > 0;
    const hasStatusChange = pendingStatus && pendingStatus !== issue.status;

    if (!hasReply && !hasStatusChange) {
      toast.error("Type a reply or pick a different status.");
      return;
    }
    if (pendingStatus === "Rejected" && !rejectReason.trim()) {
      toast.error("Please provide a reason for rejecting.");
      return;
    }

    setSubmitting(true);
    let result;
    if (hasReply) {
      // Combined reply + (optional) status change in one request
      result = await dispatch(addStaffReply({
        id,
        message: reply.trim(),
        status: hasStatusChange ? pendingStatus : undefined,
        reason: pendingStatus === "Rejected" ? rejectReason.trim() : undefined,
        expectedUpdatedAt: issue.updatedAt,
      })).unwrap();
    } else {
      // Status-only change
      result = await dispatch(updateIssueStatus({
        id,
        status: pendingStatus,
        reason: pendingStatus === "Rejected" ? rejectReason.trim() : undefined,
        expectedUpdatedAt: issue.updatedAt,
      })).unwrap();
    }
    setSubmitting(false);

    if (result.conflict) {
      toast.error(result.message);
      return; // keep composer contents so the staffer can retry after reading the update
    }
    if (result.success) {
      setReply("");
      setPendingStatus(null);
      setRejectReason("");
      toast.success(
        hasStatusChange && hasReply ? `Status changed to ${pendingStatus} + reply sent` :
        hasStatusChange ? `Status changed to ${pendingStatus}` :
        "Reply sent to student"
      );
    } else {
      toast.error(result.message || "Failed to submit");
    }
  };

  const conflictBanner = useMemo(() => {
    // Server-returned conflict: the slice already swapped in the fresh issue.
    // Show a yellow banner if the issue was last touched by someone else
    // very recently (under 30s ago) — gives a "fresh activity" signal.
    if (!issue?.lastEvent?.byName) return null;
    if (issue.lastEvent.byUserId && issue.lastEvent.byUserId._id === user?._id) return null;
    const ageMs = Date.now() - new Date(issue.lastEvent.at).getTime();
    if (ageMs > 30_000) return null;
    return `${issue.lastEvent.byName} just ${
      issue.lastEvent.type === "status" ? `changed status (${issue.lastEvent.note || ""})` :
      issue.lastEvent.type === "reply" ? "replied" :
      issue.lastEvent.type === "assign" ? `reassigned (${issue.lastEvent.note})` :
      "made changes"
    }`;
  }, [issue, user]);

  if (!issue) {
    return (
      <div className="h-full flex items-center justify-center" style={{ backgroundColor: C.bg, color: C.muted }}>
        Loading…
      </div>
    );
  }

  const sStyle = statusStyle(issue.status, isDark);

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: C.bg, color: C.text }}>
      <div className="max-w-3xl mx-auto p-6 md:p-8">
        <Link to="/staff/issues" className="inline-flex items-center gap-1.5 text-sm mb-5" style={{ color: C.muted }}>
          <ArrowLeft className="w-4 h-4" /> Back to inbox
        </Link>

        {conflictBanner && (
          <div
            className="mb-4 p-3 rounded-xl border flex items-start gap-2 text-sm"
            style={{ backgroundColor: isDark ? "#3a2f15" : "#FFF7E0", borderColor: C.amber, color: C.text }}
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: C.amber }} />
            <span><strong>Heads-up:</strong> {conflictBanner}. You're now looking at the latest version.</span>
          </div>
        )}

        {/* Issue header card */}
        <div className="p-6 rounded-xl border mb-5" style={{ backgroundColor: C.surface, borderColor: C.border }}>
          <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
            <h1 className="text-2xl font-bold">{issue.title}</h1>
            <span
              className="text-xs px-2.5 py-1 rounded-full uppercase font-semibold"
              style={{ backgroundColor: sStyle.bg, color: sStyle.text }}
            >
              {issue.status}
            </span>
          </div>

          <div
            className="flex items-center gap-3 p-3 rounded-lg mb-4 text-sm"
            style={{ backgroundColor: C.surfaceAlt, color: C.text }}
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: C.navy }}
            >
              <User className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{issue.studentName}</div>
              <div className="text-xs truncate" style={{ color: C.muted }}>{issue.studentEmail}</div>
            </div>
            <div className="text-xs text-right" style={{ color: C.muted }}>
              <div>{issue.department?.code} · {issue.category}</div>
              <div className="inline-flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {moment(issue.createdAt).format("MMM D, YYYY h:mm A")}
              </div>
            </div>
          </div>

          <p className="text-sm whitespace-pre-wrap">{issue.description}</p>

          {issue.status === "Rejected" && issue.rejectionReason && (
            <div
              className="mt-3 p-3 rounded-lg border text-sm"
              style={{ borderColor: C.red, backgroundColor: isDark ? "#2c1414" : "#FDECEC", color: C.text }}
            >
              <strong>Rejection reason:</strong> {issue.rejectionReason}
            </div>
          )}

          {issue.attachments?.length > 0 && (
            <div className="mt-4 pt-4 border-t" style={{ borderColor: C.border }}>
              <div className="text-xs font-semibold uppercase mb-2" style={{ color: C.muted }}>
                Attachments
              </div>
              <div className="flex flex-wrap gap-2">
                {issue.attachments.map((a, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPreviewAtt(a)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm hover:shadow-sm transition"
                    style={{ borderColor: C.border, color: C.text, backgroundColor: C.surfaceAlt }}
                  >
                    {isPdf(a.mimeType) ? <FileText className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
                    {a.originalName}
                  </button>
                ))}
              </div>
              <p className="text-xs mt-2" style={{ color: C.muted }}>
                Click to preview · PDFs and images open inline.
              </p>
            </div>
          )}
        </div>

        {/* Assignee strip */}
        <div className="mb-5">
          <AssigneeStrip
            issue={issue}
            currentUser={user}
            deptStaff={deptStaff}
            onAssign={handleAssign}
            busy={assignBusy}
            C={C}
          />
        </div>

        {/* Conversation */}
        <div className="mb-3 text-sm font-semibold uppercase tracking-wide" style={{ color: C.muted }}>
          Conversation
        </div>
        <div className="space-y-3 mb-5">
          {issue.replies?.length === 0 && (
            <div className="text-sm text-center py-6" style={{ color: C.muted }}>
              No replies yet.
            </div>
          )}
          {issue.replies?.map((r, i) => {
            const isStaff = r.authorRole === "staff";
            return (
              <div
                key={i}
                className="p-4 rounded-xl border"
                style={{
                  backgroundColor: isStaff ? C.surfaceAlt : C.surface,
                  borderColor: isStaff ? C.navy : C.border,
                  borderLeft: `4px solid ${isStaff ? C.navy : C.red}`,
                }}
              >
                <div className="flex items-center justify-between mb-1.5 text-xs" style={{ color: C.muted }}>
                  <span className="font-semibold" style={{ color: isStaff ? C.navy : C.text }}>
                    {r.authorName}
                    {isStaff && (
                      <span
                        className="ml-1 px-1.5 py-0.5 rounded text-[10px]"
                        style={{ backgroundColor: C.navy, color: "#fff" }}
                      >
                        STAFF
                      </span>
                    )}
                  </span>
                  <span>{moment(r.createdAt).fromNow()}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{r.message}</p>
              </div>
            );
          })}
        </div>

        {/* Combined composer: reply + optional status change */}
        <form
          onSubmit={handleSubmit}
          className="p-4 rounded-xl border space-y-3"
          style={{ backgroundColor: C.surface, borderColor: C.border }}
        >
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            placeholder="Reply to the student…"
            className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none resize-y"
            style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
          />

          <div>
            <div className="text-xs font-semibold uppercase mb-2" style={{ color: C.muted }}>
              Set status (optional)
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => { setPendingStatus(null); setRejectReason(""); }}
                className="px-3 py-1.5 rounded-full text-sm border font-medium"
                style={{
                  borderColor: pendingStatus === null ? C.navy : C.border,
                  backgroundColor: pendingStatus === null ? C.navy : "transparent",
                  color: pendingStatus === null ? "#fff" : C.text,
                }}
              >
                Keep ({issue.status})
              </button>
              {STATUSES.filter((s) => s !== issue.status).map((s) => {
                const sty = statusStyle(s, isDark);
                const active = pendingStatus === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setPendingStatus(s)}
                    className="px-3 py-1.5 rounded-full text-sm border font-medium"
                    style={{
                      borderColor: active ? sty.text : C.border,
                      backgroundColor: active ? sty.bg : "transparent",
                      color: active ? sty.text : C.text,
                    }}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          {pendingStatus === "Rejected" && (
            <div>
              <label className="text-xs font-semibold uppercase block mb-1.5" style={{ color: C.muted }}>
                Reason for rejection <span style={{ color: C.red }}>*</span>
              </label>
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. duplicate of issue #123, outside our department's scope, etc."
                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
              />
              <p className="text-xs mt-1" style={{ color: C.muted }}>
                Shown to the student so they understand why.
              </p>
            </div>
          )}

          <div className="flex justify-between items-center pt-1 flex-wrap gap-2">
            <span className="text-xs" style={{ color: C.muted }}>
              Student is notified by email and in-app{pendingStatus ? ` · status will change to ${pendingStatus}` : ""}.
            </span>
            <button
              type="submit"
              disabled={
                submitting ||
                (!reply.trim() && (!pendingStatus || pendingStatus === issue.status)) ||
                (pendingStatus === "Rejected" && !rejectReason.trim())
              }
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60"
              style={{ backgroundColor: C.navy }}
            >
              <Send className="w-4 h-4" />
              {submitting
                ? "Sending…"
                : pendingStatus && reply.trim()
                ? `Send reply + mark ${pendingStatus}`
                : pendingStatus
                ? `Mark ${pendingStatus}`
                : "Send reply"}
            </button>
          </div>
        </form>
      </div>

      <AttachmentModal attachment={previewAtt} onClose={() => setPreviewAtt(null)} C={C} />
    </div>
  );
};

export default StaffIssueDetail;
