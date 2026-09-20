import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { MessageSquareWarning, CheckCircle2, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import moment from "moment";
import toast from "react-hot-toast";
import { fetchFailedQuestions, resolveFailedQuestionGroup } from "../../redux/slices/adminFailedQuestionsSlice";
import { addChunk } from "../../redux/slices/adminDataSlice";
import AdminTable, { AdminTableRow, AdminTableCell } from "../components/AdminTable";
import LoadingSkeleton from "../components/LoadingSkeleton";
import EmptyState from "../components/EmptyState";
import AdminModal from "../components/AdminModal";
import { getPalette } from "../utils/palette";

const USER_TYPE_TABS = [
  { key: "", label: "All" },
  { key: "student", label: "Student" },
  { key: "guest", label: "Guest" },
];

// Rev 5 §4.3 — questions the chatbot answered with low confidence, grouped
// by (near-)exact repeat text with a frequency count. "Asked 14 times this
// month" tells the admin exactly which knowledge-base gap to fix next.
//
// §19.7 — guest and student gaps are a different signal (a student gap is
// missing operational content; a guest gap is missing admissions content
// the university may not otherwise learn about), so they're grouped and
// filterable separately rather than merged into one row.
const FailedQuestions = () => {
  const dispatch = useDispatch();
  const theme = useSelector((s) => s.theme.theme);
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const C = getPalette(theme === "dark", tenantBranding);
  const { groups, loading } = useSelector((s) => s.adminFailedQuestions);
  const user = useSelector((s) => s.auth.user);
  // Reachable from either /admin/failed-questions or /staff/failed-questions
  // (delegated "failedQuestions" permission) — the Data page lives at a
  // different base path for each role.
  const dataPageLink = user?.role === "staff" ? "/staff/data" : "/admin/data";
  const [userTypeFilter, setUserTypeFilter] = useState("");
  // User request — clicking a failed question opens a popup to answer it
  // right there, not an inline row expansion.
  const [activeGroup, setActiveGroup] = useState(null);
  const [answerText, setAnswerText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    dispatch(fetchFailedQuestions({ userType: userTypeFilter || undefined }));
  }, [dispatch, userTypeFilter]);

  const openGroup = (group) => {
    setActiveGroup(group);
    setAnswerText("");
  };

  const closeGroup = () => {
    setActiveGroup(null);
    setAnswerText("");
  };

  const onResolve = async (group) => {
    const result = await dispatch(resolveFailedQuestionGroup(group.ids)).unwrap();
    if (result.success) {
      toast.success("Marked as resolved");
      if (activeGroup && activeGroup.ids === group.ids) closeGroup();
    } else {
      toast.error(result.message || "Failed to mark as resolved");
    }
  };

  // User request — answer the gap right here instead of separately
  // navigating to Data.jsx to add the same content by hand. Reuses the
  // exact same manual-chunk pipeline Data.jsx's "Add Chunk" form uses (one
  // text blob, embedded and searchable immediately) — no new backend/Python
  // code needed for the KB write itself.
  const onSaveAnswer = async () => {
    if (!answerText.trim() || !activeGroup) return;
    setSaving(true);
    const result = await dispatch(addChunk({
      text: `Q: ${activeGroup.question}\nA: ${answerText.trim()}`,
      source: "failed-question",
    })).unwrap();
    setSaving(false);
    if (!result.success) {
      toast.error(result.message || "Failed to add to knowledge base");
      return;
    }
    toast.success("Added to knowledge base");
    const group = activeGroup;
    closeGroup();
    onResolve(group);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm" style={{ color: C.muted }}>
          Click a question to answer it and add it to the knowledge base, or mark it resolved once
          you've covered it elsewhere.
        </p>
        <Link
          to={dataPageLink}
          className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border"
          style={{ borderColor: C.border, color: C.navy }}
        >
          Go to Vector DB <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="flex items-center gap-1.5">
        {USER_TYPE_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setUserTypeFilter(tab.key)}
            className="px-3 py-1.5 text-xs font-semibold rounded-full border"
            style={{
              borderColor: C.border,
              backgroundColor: userTypeFilter === tab.key ? C.navy : "transparent",
              color: userTypeFilter === tab.key ? "#fff" : C.text,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <AdminTable
        columns={[
          { key: "question", label: "Question" },
          { key: "count", label: "Asked" },
          { key: "userType", label: "Who" },
          { key: "lastAskedAt", label: "Last asked" },
          { key: "actions", label: "" },
        ]}
      >
        {loading ? (
          <LoadingSkeleton cols={5} />
        ) : groups.length === 0 ? (
          <tbody>
            <tr>
              <td colSpan={5}>
                <EmptyState
                  icon={MessageSquareWarning}
                  title="No failed questions logged"
                  description="Low-confidence chatbot answers will show up here."
                />
              </td>
            </tr>
          </tbody>
        ) : (
          <tbody>
            {groups.map((g) => (
              <AdminTableRow key={`${g.userType}-${g.question}`} onClick={() => !g.isResolved && openGroup(g)}>
                <AdminTableCell>
                  <span
                    className="font-medium"
                    style={{ color: C.text, opacity: g.isResolved ? 0.5 : 1, textDecoration: g.isResolved ? "line-through" : "none" }}
                  >
                    {g.question}
                  </span>
                </AdminTableCell>
                <AdminTableCell>
                  <span
                    className="px-2 py-0.5 text-xs rounded-full font-semibold"
                    style={{ backgroundColor: `${C.red}1A`, color: C.red }}
                  >
                    {g.count}×
                  </span>
                </AdminTableCell>
                <AdminTableCell>
                  <span
                    className="px-2 py-0.5 text-xs rounded-full font-semibold capitalize"
                    style={{
                      backgroundColor: g.userType === "guest" ? `${C.amber}1A` : `${C.navy}1A`,
                      color: g.userType === "guest" ? C.amber : C.navy,
                    }}
                  >
                    {g.userType}
                  </span>
                </AdminTableCell>
                <AdminTableCell>
                  <span style={{ color: C.muted }}>{moment(g.lastAskedAt).fromNow()}</span>
                </AdminTableCell>
                <AdminTableCell>
                  {g.isResolved ? (
                    <span className="inline-flex items-center gap-1 text-xs" style={{ color: C.green }}>
                      <CheckCircle2 className="w-3.5 h-3.5" /> Resolved
                    </span>
                  ) : (
                    <span className="text-xs" style={{ color: C.navy }}>Click to answer →</span>
                  )}
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </tbody>
        )}
      </AdminTable>

      <AdminModal open={!!activeGroup} onClose={closeGroup} title="Answer this question" size="lg">
        {activeGroup && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase mb-1" style={{ color: C.muted }}>Question</p>
              <p className="text-sm" style={{ color: C.text }}>{activeGroup.question}</p>
              <p className="text-xs mt-1" style={{ color: C.muted }}>
                Asked {activeGroup.count}× · last {moment(activeGroup.lastAskedAt).fromNow()} · {activeGroup.userType}
              </p>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: C.muted }}>Answer</label>
              <textarea
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                placeholder="Type the answer to add to the knowledge base…"
                rows={4}
                autoFocus
                className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none"
                style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
              />
              <p className="text-xs mt-1" style={{ color: C.muted }}>
                This gets embedded into the knowledge base immediately, paired with the question above.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onSaveAnswer}
                disabled={!answerText.trim() || saving}
                className="px-3 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-60"
                style={{ backgroundColor: C.navy }}
              >
                {saving ? "Saving…" : "Save & resolve"}
              </button>
              <button
                onClick={() => onResolve(activeGroup)}
                className="px-3 py-2 text-sm rounded-lg border"
                style={{ borderColor: C.border, color: C.text }}
              >
                Mark resolved without answering
              </button>
              <button
                onClick={closeGroup}
                className="px-3 py-2 text-sm rounded-lg"
                style={{ color: C.muted }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </AdminModal>
    </div>
  );
};

export default FailedQuestions;
