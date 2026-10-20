import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { Lock, ArrowRightLeft, MessageSquareText, Trash2, Plus } from "lucide-react";
import moment from "moment";
import toast from "react-hot-toast";
import {
  addInternalNote,
  transferIssue,
  fetchTransferTargets,
  fetchSavedReplies,
  createSavedReply,
  deleteSavedReply,
} from "../../redux/slices/issueSlice";

const CLOSED_STATUSES = ["Resolved", "Closed", "Rejected"];

// Staff-only working notes ("called the student", "waiting on the
// registrar") — the server never sends these to the student.
export const InternalNotes = ({ issue, C, isDark }) => {
  const dispatch = useDispatch();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const notes = issue.internalNotes || [];

  const onAdd = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    const result = await dispatch(addInternalNote({ id: issue._id, message: text.trim() })).unwrap();
    setSaving(false);
    if (result.success) setText("");
    else toast.error(result.message || "Failed to add note");
  };

  return (
    <section
      className="mb-5 p-4 rounded-xl border"
      style={{ backgroundColor: isDark ? "#2a2412" : "#FFFBEB", borderColor: isDark ? "#5c4a14" : "#F3D98B" }}
      aria-label="Internal notes"
    >
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Lock className="w-4 h-4" style={{ color: C.amber }} />
        <h2 className="text-sm font-semibold">Internal notes</h2>
        <span className="text-xs" style={{ color: C.muted }}>Only staff see these — never the student.</span>
      </div>
      {notes.length === 0 ? (
        <p className="text-xs mb-3" style={{ color: C.muted }}>No notes yet.</p>
      ) : (
        <ul className="space-y-2.5 mb-3">
          {notes.map((n) => (
            <li key={n._id} className="text-sm">
              <div className="text-xs mb-0.5" style={{ color: C.muted }}>
                <span className="font-semibold" style={{ color: C.text }}>{n.authorName}</span> · {moment(n.createdAt).fromNow()}
              </div>
              <p className="whitespace-pre-wrap">{n.message}</p>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={onAdd} className="flex gap-2 items-start">
        <label htmlFor="internal-note" className="sr-only">Add an internal note</label>
        <textarea
          id="internal-note"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={4000}
          placeholder="Add a note for your colleagues…"
          className="flex-1 px-3 py-2 rounded-lg border text-sm focus:outline-none resize-y"
          style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
        />
        <button
          type="submit"
          disabled={saving || !text.trim()}
          className="px-3 py-2 rounded-lg text-sm font-medium border disabled:opacity-50"
          style={{ borderColor: C.amber, color: C.text }}
        >
          {saving ? "Saving…" : "Add note"}
        </button>
      </form>
    </section>
  );
};

// Filed with the wrong department? Send it to the right one.
export const TransferPanel = ({ issue, C }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const targets = useSelector((s) => s.issue.transferTargets);
  const [open, setOpen] = useState(false);
  const [departmentId, setDepartmentId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const closed = CLOSED_STATUSES.includes(issue.status);

  const openPanel = () => {
    setOpen(true);
    dispatch(fetchTransferTargets());
  };

  const onTransfer = async (e) => {
    e.preventDefault();
    if (!departmentId) return;
    setBusy(true);
    const result = await dispatch(
      transferIssue({ id: issue._id, departmentId, note: note.trim(), expectedUpdatedAt: issue.updatedAt })
    ).unwrap();
    setBusy(false);
    if (result.success) {
      toast.success(`Sent to ${result.transferredTo.code} — they've been notified, and so has the student.`);
      navigate("/staff/issues");
    } else {
      toast.error(result.message || "Failed to transfer");
    }
  };

  if (closed) return null;
  if (!open) {
    return (
      <button
        type="button"
        onClick={openPanel}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium"
        style={{ borderColor: C.border, color: C.text }}
      >
        <ArrowRightLeft className="w-3.5 h-3.5" /> Transfer…
      </button>
    );
  }
  return (
    <form
      onSubmit={onTransfer}
      className="basis-full mt-2 pt-3 border-t flex flex-wrap gap-2 items-start"
      style={{ borderColor: C.border }}
    >
      <label htmlFor="transfer-dept" className="sr-only">Department</label>
      <select
        id="transfer-dept"
        value={departmentId}
        onChange={(e) => setDepartmentId(e.target.value)}
        className="px-2.5 py-1.5 rounded-lg border text-sm focus:outline-none"
        style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
      >
        <option value="">Send to department…</option>
        {targets.map((d) => (
          <option key={d._id} value={d._id}>{d.code} — {d.name}</option>
        ))}
      </select>
      <label htmlFor="transfer-note" className="sr-only">Note for the other department</label>
      <input
        id="transfer-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={1000}
        placeholder="Why it's theirs (optional, staff-only)"
        className="flex-1 min-w-[180px] px-2.5 py-1.5 rounded-lg border text-sm focus:outline-none"
        style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
      />
      <button
        type="submit"
        disabled={busy || !departmentId}
        className="px-3 py-1.5 rounded-lg text-white text-sm font-medium disabled:opacity-50"
        style={{ backgroundColor: C.navy }}
      >
        {busy ? "Sending…" : "Transfer"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="px-2 py-1.5 text-sm" style={{ color: C.muted }}>
        Cancel
      </button>
    </form>
  );
};

// The department's saved replies: insert one into the reply box, or save
// what you've written for next time. "{student}" becomes the student's
// first name.
export const SavedReplyPicker = ({ issue, reply, onInsert, C }) => {
  const dispatch = useDispatch();
  const replies = useSelector((s) => s.issue.savedReplies);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const firstName = (issue.studentName || "").split(" ")[0] || "there";

  const toggle = () => {
    if (!open) dispatch(fetchSavedReplies());
    setOpen((v) => !v);
  };

  const insert = (body) => {
    onInsert(body.replace(/\{student\}/gi, firstName));
    setOpen(false);
  };

  // Not a <form>: the picker sits inside the reply form, and a nested form's
  // submit would also send the reply to the student.
  const onSave = async () => {
    if (!title.trim() || !reply.trim()) return;
    setSaving(true);
    const result = await dispatch(createSavedReply({ title: title.trim(), body: reply.trim() })).unwrap();
    setSaving(false);
    if (result.success) {
      setTitle("");
      toast.success("Saved for your department");
    } else {
      toast.error(result.message || "Failed to save");
    }
  };

  const onDelete = async (r) => {
    const result = await dispatch(deleteSavedReply(r._id)).unwrap();
    if (!result.success) toast.error(result.message || "Failed to delete");
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium"
        style={{ borderColor: C.border, color: C.text }}
      >
        <MessageSquareText className="w-3.5 h-3.5" /> Saved replies
      </button>
      {open && (
        <div
          className="absolute z-20 mt-1 w-[min(420px,90vw)] rounded-xl border shadow-lg p-2"
          style={{ backgroundColor: C.surface, borderColor: C.border }}
        >
          {replies.length === 0 ? (
            <p className="text-xs p-2" style={{ color: C.muted }}>
              No saved replies yet. Write a reply, then save it below for your whole department.
            </p>
          ) : (
            <ul className="max-h-64 overflow-y-auto">
              {replies.map((r) => (
                <li key={r._id} className="flex items-start gap-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5">
                  <button type="button" onClick={() => insert(r.body)} className="flex-1 text-left p-2 min-w-0">
                    <span className="block text-sm font-medium truncate" style={{ color: C.text }}>{r.title}</span>
                    <span className="block text-xs truncate" style={{ color: C.muted }}>{r.body}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(r)}
                    aria-label={`Delete saved reply ${r.title}`}
                    title="Delete"
                    className="p-2 shrink-0"
                    style={{ color: C.muted }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2 mt-2 pt-2 border-t" style={{ borderColor: C.border }}>
            <label htmlFor="saved-reply-title" className="sr-only">Saved reply title</label>
            <input
              id="saved-reply-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onSave();
                }
              }}
              maxLength={120}
              placeholder={reply.trim() ? "Title for the current reply" : "Write a reply first to save it"}
              disabled={!reply.trim()}
              className="flex-1 px-2.5 py-1.5 rounded-lg border text-xs focus:outline-none disabled:opacity-60"
              style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
            />
            <button
              type="button"
              onClick={onSave}
              disabled={saving || !title.trim() || !reply.trim()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: C.navy }}
            >
              <Plus className="w-3.5 h-3.5" /> Save
            </button>
          </div>
          <p className="text-[11px] mt-1.5 px-1" style={{ color: C.muted }}>
            Tip: write {"{student}"} where the student's first name should go.
          </p>
        </div>
      )}
    </div>
  );
};
