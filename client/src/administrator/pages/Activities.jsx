import React, { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  Plus, X, Trash2, Sparkles, Trophy, Users, Music, Palette, BookOpen,
  Camera, Dumbbell, Globe, Heart, Mic, Code, Drama, Landmark, Rocket,
  Type, AlignLeft, Image as ImageIcon, ArrowUp, ArrowDown, Eye, EyeOff,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  fetchActivityTabs,
  createActivityTab,
  updateActivityTab,
  deleteActivityTab,
  uploadActivityImage,
} from "../../redux/slices/adminActivitySlice";
import AdminTable, { AdminTableRow, AdminTableCell } from "../components/AdminTable";
import LoadingSkeleton from "../components/LoadingSkeleton";
import EmptyState from "../components/EmptyState";
import { getPalette } from "../utils/palette";

// Must match server/controllers/adminActivityController.js's ALLOWED_ICONS
// exactly — the server is the source of truth (it validates and rejects
// anything outside this list); this map only decides what each renders as.
const ICONS = {
  Sparkles, Trophy, Users, Music, Palette, BookOpen, Camera,
  Dumbbell, Globe, Heart, Mic, Code, Drama, Landmark, Rocket,
};
const ICON_NAMES = Object.keys(ICONS);

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3000";

const emptyForm = { title: "", icon: "Sparkles", order: 0, isPublished: false, sections: [] };

const toFormValue = (tab) =>
  tab
    ? {
        title: tab.title,
        icon: tab.icon,
        order: tab.order,
        isPublished: tab.isPublished,
        sections: tab.sections.map((s) => ({ ...s })),
      }
    : { ...emptyForm };

const Activities = () => {
  const dispatch = useDispatch();
  const theme = useSelector((s) => s.theme.theme);
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const C = getPalette(theme === "dark", tenantBranding);
  const { tabs, loading } = useSelector((s) => s.adminActivity);

  const [editing, setEditing] = useState(null); // tab object, or {} for "new"
  const [form, setForm] = useState(emptyForm);
  const [uploadingIndex, setUploadingIndex] = useState(null);
  const fileInputRef = useRef(null);
  const pendingImageIndex = useRef(null);

  useEffect(() => {
    dispatch(fetchActivityTabs());
  }, [dispatch]);

  const openEdit = (tab) => {
    setEditing(tab);
    setForm(toFormValue(tab));
  };
  const openCreate = () => {
    setEditing({});
    setForm(emptyForm);
  };
  const close = () => {
    setEditing(null);
    setForm(emptyForm);
  };

  const addSection = (type) => {
    setForm((f) => ({ ...f, sections: [...f.sections, { type, content: "", caption: "" }] }));
  };
  const updateSection = (index, patch) => {
    setForm((f) => ({
      ...f,
      sections: f.sections.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));
  };
  const removeSection = (index) => {
    setForm((f) => ({ ...f, sections: f.sections.filter((_, i) => i !== index) }));
  };
  const moveSection = (index, dir) => {
    setForm((f) => {
      const target = index + dir;
      if (target < 0 || target >= f.sections.length) return f;
      const sections = [...f.sections];
      [sections[index], sections[target]] = [sections[target], sections[index]];
      return { ...f, sections };
    });
  };

  const triggerImagePick = (index) => {
    pendingImageIndex.current = index;
    fileInputRef.current?.click();
  };
  const onFileChosen = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const index = pendingImageIndex.current;
    if (!file || index == null) return;
    setUploadingIndex(index);
    const result = await dispatch(uploadActivityImage(file)).unwrap();
    setUploadingIndex(null);
    if (result.success) {
      updateSection(index, { content: result.url });
    } else {
      toast.error(result.message || "Upload failed");
    }
  };

  const onSave = async () => {
    if (!form.title.trim()) return toast.error("Title is required");
    if (form.sections.some((s) => !s.content.trim())) {
      return toast.error("Every section needs content before saving — remove any empty ones.");
    }
    const isNew = !editing._id;
    const action = isNew ? createActivityTab(form) : updateActivityTab({ id: editing._id, ...form });
    const result = await dispatch(action).unwrap();
    if (result.success) {
      toast.success(isNew ? "Activity tab created" : "Saved");
      close();
    } else {
      toast.error(result.message || "Failed to save");
    }
  };

  const onDelete = async () => {
    if (!editing?._id) return;
    const result = await dispatch(deleteActivityTab(editing._id)).unwrap();
    if (result.success) {
      toast.success("Deleted");
      close();
    } else {
      toast.error(result.message || "Failed to delete");
    }
  };

  const SECTION_META = {
    heading: { label: "Heading", icon: Type },
    paragraph: { label: "Paragraph", icon: AlignLeft },
    image: { label: "Image", icon: ImageIcon },
  };

  return (
    <div className="space-y-4">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChosen} />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm" style={{ color: C.muted }}>
          Extra tabs shown in the guest sidebar next to Chat and Scholarships — Sports, Societies, or
          anything else about campus life. Only published tabs are visible to guests.
        </p>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white shrink-0"
          style={{ backgroundColor: C.navy }}
        >
          <Plus className="w-4 h-4" /> Add Tab
        </button>
      </div>

      <AdminTable columns={[
        { key: "title", label: "Title" },
        { key: "icon", label: "Icon" },
        { key: "order", label: "Order" },
        { key: "status", label: "Status" },
      ]}>
        {loading ? (
          <LoadingSkeleton cols={4} />
        ) : tabs.length === 0 ? (
          <tbody>
            <tr>
              <td colSpan={4}>
                <EmptyState icon={Sparkles} title="No activity tabs yet" description="Add one to show it in the guest sidebar." />
              </td>
            </tr>
          </tbody>
        ) : (
          <tbody>
            {tabs.map((t) => {
              const Icon = ICONS[t.icon] || Sparkles;
              return (
                <AdminTableRow key={t._id} onClick={() => openEdit(t)}>
                  <AdminTableCell><span className="font-medium" style={{ color: C.text }}>{t.title}</span></AdminTableCell>
                  <AdminTableCell><Icon className="w-4 h-4" style={{ color: C.muted }} /></AdminTableCell>
                  <AdminTableCell><span style={{ color: C.muted }}>{t.order}</span></AdminTableCell>
                  <AdminTableCell>
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full font-medium"
                      style={{ backgroundColor: t.isPublished ? `${C.green}1A` : `${C.muted}1A`, color: t.isPublished ? C.green : C.muted }}
                    >
                      {t.isPublished ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      {t.isPublished ? "Published" : "Draft"}
                    </span>
                  </AdminTableCell>
                </AdminTableRow>
              );
            })}
          </tbody>
        )}
      </AdminTable>

      {editing && (
        <div className="fixed inset-0 z-50 flex" onClick={close}>
          <div className="flex-1" style={{ backgroundColor: "rgba(15, 22, 38, 0.5)" }} />
          <aside
            className="w-full sm:w-[560px] h-full overflow-y-auto border-l p-5 space-y-4"
            style={{ backgroundColor: C.surface, borderColor: C.border }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold" style={{ color: C.text }}>
                {editing._id ? "Edit activity tab" : "New activity tab"}
              </h3>
              <button onClick={close}><X className="w-5 h-5" style={{ color: C.muted }} /></button>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase block mb-1" style={{ color: C.muted }}>Title</label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Sports"
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold uppercase block mb-1" style={{ color: C.muted }}>Icon</label>
                <select
                  value={form.icon}
                  onChange={(e) => setForm({ ...form, icon: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
                >
                  {ICON_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase block mb-1" style={{ color: C.muted }}>Sidebar order</label>
                <input
                  type="number"
                  value={form.order}
                  onChange={(e) => setForm({ ...form, order: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm" style={{ color: C.text }}>
              <input
                type="checkbox"
                checked={form.isPublished}
                onChange={(e) => setForm({ ...form, isPublished: e.target.checked })}
              />
              Published (visible to guests)
            </label>

            <div className="pt-2 border-t space-y-3" style={{ borderColor: C.border }}>
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase" style={{ color: C.muted }}>Page content</label>
                <div className="flex gap-1.5">
                  {Object.entries(SECTION_META).map(([type, meta]) => (
                    <button
                      key={type}
                      onClick={() => addSection(type)}
                      title={`Add ${meta.label}`}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs"
                      style={{ borderColor: C.border, color: C.text }}
                    >
                      <meta.icon className="w-3.5 h-3.5" /> {meta.label}
                    </button>
                  ))}
                </div>
              </div>

              {form.sections.length === 0 && (
                <p className="text-xs" style={{ color: C.muted }}>No content yet — add a heading, paragraph, or image above.</p>
              )}

              {form.sections.map((s, i) => {
                const meta = SECTION_META[s.type];
                return (
                  <div key={i} className="p-3 rounded-lg border space-y-2" style={{ borderColor: C.border, backgroundColor: C.input }}>
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase" style={{ color: C.muted }}>
                        <meta.icon className="w-3.5 h-3.5" /> {meta.label}
                      </span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => moveSection(i, -1)} disabled={i === 0} className="p-1 disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" style={{ color: C.muted }} /></button>
                        <button onClick={() => moveSection(i, 1)} disabled={i === form.sections.length - 1} className="p-1 disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" style={{ color: C.muted }} /></button>
                        <button onClick={() => removeSection(i)} className="p-1"><Trash2 className="w-3.5 h-3.5" style={{ color: C.red }} /></button>
                      </div>
                    </div>

                    {s.type === "heading" && (
                      <input
                        value={s.content}
                        onChange={(e) => updateSection(i, { content: e.target.value })}
                        placeholder="Heading text"
                        className="w-full px-3 py-2 rounded-lg border text-sm font-semibold"
                        style={{ backgroundColor: C.surface, borderColor: C.border, color: C.text }}
                      />
                    )}

                    {s.type === "paragraph" && (
                      <textarea
                        value={s.content}
                        onChange={(e) => updateSection(i, { content: e.target.value })}
                        placeholder="Paragraph text"
                        rows={4}
                        className="w-full px-3 py-2 rounded-lg border text-sm resize-y"
                        style={{ backgroundColor: C.surface, borderColor: C.border, color: C.text }}
                      />
                    )}

                    {s.type === "image" && (
                      <div className="space-y-2">
                        {s.content ? (
                          <img src={`${SERVER_URL}${s.content}`} alt="" className="w-full max-h-40 object-cover rounded-lg" />
                        ) : null}
                        <button
                          onClick={() => triggerImagePick(i)}
                          disabled={uploadingIndex === i}
                          className="px-3 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-60"
                          style={{ borderColor: C.border, color: C.text }}
                        >
                          {uploadingIndex === i ? "Uploading…" : s.content ? "Replace image" : "Upload image"}
                        </button>
                        <input
                          value={s.caption}
                          onChange={(e) => updateSection(i, { caption: e.target.value })}
                          placeholder="Caption (optional)"
                          className="w-full px-3 py-2 rounded-lg border text-sm"
                          style={{ backgroundColor: C.surface, borderColor: C.border, color: C.text }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t" style={{ borderColor: C.border }}>
              <button onClick={onSave} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: C.navy }}>Save</button>
              {editing._id && (
                <button onClick={onDelete} className="px-3 py-2 rounded-lg text-sm font-medium border" style={{ borderColor: C.border, color: C.red }}>Delete</button>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};

export default Activities;
