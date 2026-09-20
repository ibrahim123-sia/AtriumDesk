import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  GraduationCap,
  Briefcase,
  CalendarClock,
  Link2,
  Plus,
  X,
  Play,
  Pause,
  Trash2,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import moment from "moment";
import toast from "react-hot-toast";
import {
  fetchListings,
  createListing,
  updateListing,
  approveListing,
  rejectListing,
  deleteListing,
  unmergeListing,
} from "../../redux/slices/adminListingSlice";
import {
  fetchSources,
  createSource,
  runSourceNow,
  pauseSource,
  resumeSource,
  deleteSource,
} from "../../redux/slices/adminSourceSlice";
import AdminTable, { AdminTableRow, AdminTableCell } from "../components/AdminTable";
import LoadingSkeleton from "../components/LoadingSkeleton";
import EmptyState from "../components/EmptyState";
import { getPalette } from "../utils/palette";

const STATUSES = ["All", "pending", "approved", "rejected", "expired", "delisted"];

// Rev 5 §9.1 — "schema-driven editable form". A per-type field list rather
// than a full generic JSON-schema form generator: cheap, direct match to
// the three known Listing discriminators (see server/models/Listing.js),
// no need for a generalized form engine three fields would never justify.
const FIELD_CONFIGS = {
  scholarship: [
    { key: "title", label: "Title" },
    { key: "organization", label: "Organization" },
    {
      key: "scope",
      label: "Scope",
      type: "select",
      options: ["external", "internal"],
      hint: "Internal = this university's own award (shown to guests too). External = a third-party scholarship (Chevening, Fulbright, etc.) — students only.",
    },
    { key: "country", label: "Country" },
    { key: "degreeLevel", label: "Degree level", type: "select", options: ["bachelors", "masters", "phd", "other"] },
    { key: "fundingType", label: "Funding type", type: "select", options: ["fully_funded", "partial", "self_funded", "other"] },
    { key: "deadline", label: "Deadline", type: "date" },
    { key: "eligibilityCriteria", label: "Eligibility criteria", type: "textarea" },
    { key: "requiredDocuments", label: "Required documents (comma-separated)", type: "list" },
    { key: "languageRequirements", label: "Language requirements" },
    { key: "cgpaRequirement", label: "CGPA requirement", type: "number" },
    { key: "ieltsRequirement", label: "IELTS requirement", type: "number" },
    { key: "toeflRequirement", label: "TOEFL requirement", type: "number" },
    { key: "officialLink", label: "Official link" },
    { key: "description", label: "Description", type: "textarea" },
  ],
  job: [
    { key: "title", label: "Title" },
    { key: "organization", label: "Company" },
    { key: "workMode", label: "Work mode", type: "select", options: ["remote", "onsite", "hybrid"] },
    { key: "location", label: "Location" },
    { key: "locationRestriction", label: "Location restriction" },
    { key: "experienceLevel", label: "Experience level" },
    { key: "isFreshGradFriendly", label: "Fresh-grad friendly", type: "checkbox" },
    { key: "skillsRequired", label: "Skills required (comma-separated)", type: "list" },
    { key: "deadline", label: "Deadline", type: "date" },
    { key: "officialLink", label: "Official link" },
    { key: "description", label: "Description", type: "textarea" },
  ],
  event: [
    { key: "title", label: "Title" },
    { key: "organization", label: "Hosting department" },
    { key: "date", label: "Date", type: "date", required: true },
    { key: "location", label: "Location" },
    { key: "officialLink", label: "Official link" },
    { key: "description", label: "Description", type: "textarea" },
  ],
};

const statusColor = (status, C) => {
  if (status === "approved") return C.green;
  if (status === "pending") return C.amber;
  if (status === "rejected") return C.red;
  return C.muted; // expired/delisted
};

const toFormValue = (listing, fields) => {
  const out = {};
  for (const f of fields) {
    const v = listing?.[f.key];
    if (f.type === "list") out[f.key] = Array.isArray(v) ? v.join(", ") : "";
    else if (f.type === "date") out[f.key] = v ? String(v).slice(0, 10) : "";
    else if (f.type === "checkbox") out[f.key] = !!v;
    // A <select> with no matching option shows the browser's own default
    // (first option) visually while React's state stays "" — defaulting
    // here to f.options[0] keeps displayed and stored state in sync.
    else if (f.type === "select") out[f.key] = v ?? f.options[0];
    else out[f.key] = v ?? "";
  }
  return out;
};

const fromFormValue = (form, fields) => {
  const out = {};
  for (const f of fields) {
    const v = form[f.key];
    if (f.type === "list") out[f.key] = v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
    else if (f.type === "number") out[f.key] = v === "" ? null : Number(v);
    else if (f.type === "date") out[f.key] = v || null;
    else out[f.key] = v;
  }
  return out;
};

// One generic table+drawer+"Add Manually" modal, reused across all three
// listing tabs — Rev 5 §9.1's explicit instruction, not three near-copies.
const ListingsTab = ({ type }) => {
  const dispatch = useDispatch();
  const theme = useSelector((s) => s.theme.theme);
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const C = getPalette(theme === "dark", tenantBranding);
  const { listings, loading } = useSelector((s) => s.adminListing);
  const [statusFilter, setStatusFilter] = useState("All");
  const [drawerListing, setDrawerListing] = useState(null);
  const [form, setForm] = useState({});
  const [addOpen, setAddOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const fields = FIELD_CONFIGS[type];

  useEffect(() => {
    dispatch(fetchListings({ type, status: statusFilter === "All" ? undefined : statusFilter }));
  }, [dispatch, type, statusFilter]);

  const openDrawer = (listing) => {
    setDrawerListing(listing);
    setForm(toFormValue(listing, fields));
    setRejectReason("");
  };
  const openAdd = () => {
    setForm(toFormValue({}, fields));
    setAddOpen(true);
  };

  const renderField = (f) => (
    <div key={f.key}>
      <label className="text-xs font-semibold uppercase block mb-1" style={{ color: C.muted }}>
        {f.label}
      </label>
      {f.type === "select" ? (
        <select
          value={form[f.key] ?? ""}
          onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border text-sm"
          style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
        >
          {f.options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      ) : f.type === "textarea" ? (
        <textarea
          value={form[f.key] ?? ""}
          onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
          rows={3}
          className="w-full px-3 py-2 rounded-lg border text-sm resize-y"
          style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
        />
      ) : f.type === "checkbox" ? (
        <input
          type="checkbox"
          checked={!!form[f.key]}
          onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })}
        />
      ) : (
        <input
          type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
          value={form[f.key] ?? ""}
          onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border text-sm"
          style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
        />
      )}
      {f.hint && (
        <p className="text-xs mt-1" style={{ color: C.muted }}>{f.hint}</p>
      )}
    </div>
  );

  const onSave = async () => {
    const result = await dispatch(
      updateListing({ id: drawerListing._id, ...fromFormValue(form, fields) })
    ).unwrap();
    if (result.success) {
      toast.success("Saved");
      setDrawerListing(null);
    } else {
      toast.error(result.message || "Failed to save");
    }
  };

  const onAddManually = async () => {
    const result = await dispatch(createListing({ type, ...fromFormValue(form, fields) })).unwrap();
    if (result.success) {
      toast.success("Added");
      setAddOpen(false);
    } else {
      toast.error(result.message || "Failed to add");
    }
  };

  const onApprove = async () => {
    const result = await dispatch(approveListing(drawerListing._id)).unwrap();
    if (result.success) { toast.success("Approved"); setDrawerListing(null); }
    else toast.error(result.message || "Failed to approve");
  };
  const onReject = async () => {
    const result = await dispatch(rejectListing({ id: drawerListing._id, reason: rejectReason })).unwrap();
    if (result.success) { toast.success("Rejected"); setDrawerListing(null); }
    else toast.error(result.message || "Failed to reject");
  };
  const onDelete = async () => {
    const result = await dispatch(deleteListing(drawerListing._id)).unwrap();
    if (result.success) { toast.success("Deleted"); setDrawerListing(null); }
    else toast.error(result.message || "Failed to delete");
  };
  const onUnmerge = async (mergeEntryId) => {
    const result = await dispatch(unmergeListing({ id: drawerListing._id, mergeEntryId })).unwrap();
    if (result.success) {
      toast.success("Split back out as its own pending listing");
      setDrawerListing(result.listing);
    } else {
      toast.error(result.message || "Failed to unmerge");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className="px-3 py-1.5 rounded-full text-sm border"
              style={{
                borderColor: statusFilter === s ? C.navy : C.border,
                backgroundColor: statusFilter === s ? C.navy : "transparent",
                color: statusFilter === s ? "#fff" : C.text,
              }}
            >
              {s}
            </button>
          ))}
        </div>
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white"
          style={{ backgroundColor: C.navy }}
        >
          <Plus className="w-4 h-4" /> Add Manually
        </button>
      </div>

      <AdminTable
        columns={[
          { key: "title", label: "Title" },
          { key: "organization", label: "Organization" },
          { key: "status", label: "Status" },
          { key: "source", label: "Source" },
          { key: "created", label: "Added" },
        ]}
      >
        {loading ? (
          <LoadingSkeleton cols={5} />
        ) : listings.length === 0 ? (
          <tbody>
            <tr>
              <td colSpan={5}>
                <EmptyState icon={GraduationCap} title="No listings" description="Add one manually or scrape a source." />
              </td>
            </tr>
          </tbody>
        ) : (
          <tbody>
            {listings.map((l) => (
              <AdminTableRow key={l._id} onClick={() => openDrawer(l)}>
                <AdminTableCell><span className="font-medium" style={{ color: C.text }}>{l.title}</span></AdminTableCell>
                <AdminTableCell><span style={{ color: C.muted }}>{l.organization}</span></AdminTableCell>
                <AdminTableCell>
                  <span className="px-2 py-0.5 text-xs rounded-full font-medium" style={{ backgroundColor: `${statusColor(l.status, C)}1A`, color: statusColor(l.status, C) }}>
                    {l.status}
                  </span>
                </AdminTableCell>
                <AdminTableCell><span style={{ color: C.muted }}>{l.source}</span></AdminTableCell>
                <AdminTableCell><span style={{ color: C.muted }}>{moment(l.createdAt).fromNow()}</span></AdminTableCell>
              </AdminTableRow>
            ))}
          </tbody>
        )}
      </AdminTable>

      {(drawerListing || addOpen) && (
        <div className="fixed inset-0 z-50 flex" onClick={() => { setDrawerListing(null); setAddOpen(false); }}>
          <div className="flex-1" style={{ backgroundColor: "rgba(15, 22, 38, 0.5)" }} />
          <aside
            className="w-full sm:w-[480px] h-full overflow-y-auto border-l p-5 space-y-4"
            style={{ backgroundColor: C.surface, borderColor: C.border }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold" style={{ color: C.text }}>
                {addOpen ? "Add listing manually" : "Edit listing"}
              </h3>
              <button onClick={() => { setDrawerListing(null); setAddOpen(false); }}>
                <X className="w-5 h-5" style={{ color: C.muted }} />
              </button>
            </div>
            {fields.map(renderField)}
            {!addOpen && drawerListing?.mergedFrom?.length > 0 && (
              <div className="space-y-2 pt-2 border-t" style={{ borderColor: C.border }}>
                <p className="text-xs font-semibold uppercase" style={{ color: C.muted }}>
                  Found on {drawerListing.mergedFrom.length + 1} sources
                </p>
                {drawerListing.mergedFrom.map((entry) => (
                  <div
                    key={entry._id}
                    className="flex items-center justify-between gap-2 p-2 rounded-lg border text-sm"
                    style={{ borderColor: C.border, backgroundColor: C.input }}
                  >
                    <div className="min-w-0">
                      <a href={entry.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 truncate" style={{ color: C.navy }}>
                        <Link2 className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{entry.url}</span>
                      </a>
                      <p className="text-xs" style={{ color: C.muted }}>
                        {Math.round((entry.similarityScore ?? 0) * 100)}% match · merged {moment(entry.mergedAt).fromNow()}
                      </p>
                    </div>
                    <button
                      onClick={() => onUnmerge(entry._id)}
                      className="shrink-0 text-xs px-2.5 py-1 rounded-full border"
                      style={{ borderColor: C.border, color: C.text }}
                    >
                      Unmerge
                    </button>
                  </div>
                ))}
              </div>
            )}
            {!addOpen && drawerListing?.status === "rejected" && drawerListing.rejectionReason && (
              <p className="text-xs" style={{ color: C.red }}>Rejection reason: {drawerListing.rejectionReason}</p>
            )}
            {!addOpen && (
              <div>
                <label className="text-xs font-semibold uppercase block mb-1" style={{ color: C.muted }}>
                  Rejection reason (if rejecting)
                </label>
                <input
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
                />
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-2 border-t" style={{ borderColor: C.border }}>
              {addOpen ? (
                <button onClick={onAddManually} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: C.navy }}>
                  Save (approved)
                </button>
              ) : (
                <>
                  <button onClick={onSave} className="px-3 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: C.navy }}>Save</button>
                  <button onClick={onApprove} className="px-3 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: C.green }}>Approve</button>
                  <button onClick={onReject} className="px-3 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: C.red }}>Reject</button>
                  <button onClick={onDelete} className="px-3 py-2 rounded-lg text-sm font-medium border" style={{ borderColor: C.border, color: C.text }}>Delete</button>
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};

const SourceStatusBadge = ({ status, C }) => {
  const color = status === "active" ? C.green : status === "paused" ? C.muted : C.red;
  return (
    <span className="px-2 py-0.5 text-xs rounded-full font-medium" style={{ backgroundColor: `${color}1A`, color }}>
      {status}
    </span>
  );
};

const SourcesTab = () => {
  const dispatch = useDispatch();
  const theme = useSelector((s) => s.theme.theme);
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const C = getPalette(theme === "dark", tenantBranding);
  const { sources, loading } = useSelector((s) => s.adminSource);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ url: "", type: "scholarship", name: "", frequency: "" });
  const [scraping, setScraping] = useState(false);
  const [runningId, setRunningId] = useState(null);

  useEffect(() => {
    dispatch(fetchSources());
  }, [dispatch]);

  const onAdd = async (e) => {
    e.preventDefault();
    setScraping(true);
    const result = await dispatch(createSource({ ...form, frequency: form.frequency || undefined })).unwrap();
    setScraping(false);
    if (result.success) {
      toast.success(form.frequency ? "Source saved — the scheduler will pick it up" : "Scraped — a pending listing was created");
      setAddOpen(false);
      setForm({ url: "", type: "scholarship", name: "", frequency: "" });
    } else {
      toast.error(result.message || "Failed to add source");
    }
  };

  const onRunNow = async (id) => {
    setRunningId(id);
    const result = await dispatch(runSourceNow(id)).unwrap();
    setRunningId(null);
    if (result.success) {
      toast.success(result.changed ? "New pending listing created" : "No changes since last run");
      dispatch(fetchSources());
    } else {
      toast.error(result.message || "Run failed");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: C.navy }}>
          <Plus className="w-4 h-4" /> Add Source
        </button>
      </div>

      <AdminTable
        columns={[
          { key: "url", label: "URL" },
          { key: "type", label: "Type" },
          { key: "name", label: "Name" },
          { key: "frequency", label: "Frequency" },
          { key: "lastRun", label: "Last Run" },
          { key: "status", label: "Status" },
          { key: "failures", label: "Failures" },
          { key: "actions", label: "" },
        ]}
      >
        {loading ? (
          <LoadingSkeleton cols={8} />
        ) : sources.length === 0 ? (
          <tbody><tr><td colSpan={8}><EmptyState icon={Link2} title="No sources" description="Add a URL to scrape." /></td></tr></tbody>
        ) : (
          <tbody>
            {sources.map((s) => (
              <AdminTableRow key={s._id}>
                <AdminTableCell><span className="truncate block max-w-[200px]" style={{ color: C.text }}>{s.url}</span></AdminTableCell>
                <AdminTableCell><span style={{ color: C.muted }}>{s.type}</span></AdminTableCell>
                <AdminTableCell><span style={{ color: C.text }}>{s.name}</span></AdminTableCell>
                <AdminTableCell><span style={{ color: C.muted }}>{s.frequency || "one-time"}</span></AdminTableCell>
                <AdminTableCell><span style={{ color: C.muted }}>{s.lastRun ? moment(s.lastRun).fromNow() : "never"}</span></AdminTableCell>
                <AdminTableCell><SourceStatusBadge status={s.status} C={C} /></AdminTableCell>
                <AdminTableCell>
                  <span className="inline-flex items-center gap-1" style={{ color: s.consecutiveFailures > 0 ? C.red : C.muted }}>
                    {s.consecutiveFailures > 0 && <AlertTriangle className="w-3.5 h-3.5" />} {s.consecutiveFailures}
                  </span>
                </AdminTableCell>
                <AdminTableCell>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => onRunNow(s._id)} disabled={runningId === s._id} title="Run Now" className="p-1.5 rounded border" style={{ borderColor: C.border, color: C.navy }}>
                      <Play className="w-3.5 h-3.5" />
                    </button>
                    {s.status === "paused" ? (
                      <button onClick={() => dispatch(resumeSource(s._id))} title="Resume" className="p-1.5 rounded border" style={{ borderColor: C.border, color: C.green }}>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button onClick={() => dispatch(pauseSource(s._id))} title="Pause" className="p-1.5 rounded border" style={{ borderColor: C.border, color: C.muted }}>
                        <Pause className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button onClick={() => dispatch(deleteSource(s._id))} title="Delete" className="p-1.5 rounded border" style={{ borderColor: C.border, color: C.red }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </tbody>
        )}
      </AdminTable>

      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(15, 22, 38, 0.5)" }} onClick={() => setAddOpen(false)}>
          <form onSubmit={onAdd} onClick={(e) => e.stopPropagation()} className="w-full max-w-md p-5 rounded-xl border space-y-3" style={{ backgroundColor: C.surface, borderColor: C.border }}>
            <h3 className="font-semibold" style={{ color: C.text }}>Add Source</h3>
            <input required placeholder="https://..." value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }} />
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}>
              <option value="scholarship">Scholarship</option>
              <option value="job">Job</option>
              <option value="event">Event</option>
            </select>
            <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }} />
            <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}>
              <option value="">One-time</option>
              <option value="daily">Recurring — daily</option>
              <option value="weekly">Recurring — weekly</option>
            </select>
            {scraping && <p className="text-xs" style={{ color: C.muted }}>Scraping… this can take up to 30 seconds.</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setAddOpen(false)} className="px-3 py-2 text-sm" style={{ color: C.muted }}>Cancel</button>
              <button type="submit" disabled={scraping} className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60" style={{ backgroundColor: C.navy }}>
                {scraping ? "Working…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

const TABS = [
  { key: "scholarship", label: "Scholarships", icon: GraduationCap },
  { key: "job", label: "Jobs", icon: Briefcase },
  { key: "event", label: "Events", icon: CalendarClock },
  { key: "sources", label: "Sources", icon: Link2 },
];

const Content = () => {
  const theme = useSelector((s) => s.theme.theme);
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const C = getPalette(theme === "dark", tenantBranding);
  const [tab, setTab] = useState("scholarship");

  return (
    <div className="space-y-5">
      <div className="flex gap-2 border-b pb-3" style={{ borderColor: C.border }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{
              backgroundColor: tab === t.key ? C.navy : "transparent",
              color: tab === t.key ? "#fff" : C.text,
            }}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>
      {tab === "sources" ? <SourcesTab /> : <ListingsTab key={tab} type={tab} />}
    </div>
  );
};

export default Content;
