import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Upload, X, FileText, Image as ImageIcon } from "lucide-react";
import toast from "react-hot-toast";
import { createIssue } from "../../redux/slices/issueSlice";
import { fetchDepartments } from "../../redux/slices/departmentSlice";
import { getPalette } from "../../administrator/utils/palette";

const CATEGORIES = [
  "finance",
  "academics",
  "IT",
  "administrative",
  "hostel",
  "library",
  "other",
];

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILES = 3;

const CreateIssue = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const departments = useSelector((s) => s.department.departments);
  const submitting = useSelector((s) => s.issue.submitting);
  const theme = useSelector((s) => s.theme.theme);
  const isDark = theme === "dark";
  const tenantBranding = useSelector((s) => s.tenant.branding);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [departmentId, setDepartmentId] = useState("");
  const [files, setFiles] = useState([]);

  const C = getPalette(isDark, tenantBranding);

  useEffect(() => {
    dispatch(fetchDepartments());
  }, [dispatch]);

  useEffect(() => {
    if (!departmentId && departments.length > 0) {
      setDepartmentId(departments[0]._id);
    }
  }, [departments, departmentId]);

  const onFileChange = (e) => {
    const incoming = Array.from(e.target.files || []);
    e.target.value = "";
    const allowed = [];
    for (const f of incoming) {
      if (files.length + allowed.length >= MAX_FILES) {
        toast.error(`Max ${MAX_FILES} files`);
        break;
      }
      if (f.size > MAX_FILE_SIZE) {
        toast.error(`${f.name} exceeds 5MB`);
        continue;
      }
      const isPdf = f.type === "application/pdf";
      const isImage = f.type.startsWith("image/");
      if (!isPdf && !isImage) {
        toast.error(`${f.name}: only PDF or images allowed`);
        continue;
      }
      allowed.push(f);
    }
    setFiles((prev) => [...prev, ...allowed]);
  };

  const removeFile = (idx) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !description.trim() || !departmentId) {
      toast.error("Title, description, and department are required");
      return;
    }
    const result = await dispatch(
      createIssue({ title: title.trim(), description: description.trim(), category, departmentId, files })
    ).unwrap();
    if (result.success) {
      toast.success("Issue submitted");
      navigate(`/issues/${result.issue._id}`);
    } else {
      toast.error(result.message || "Failed to submit issue");
    }
  };

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: C.bg, color: C.text }}>
      <div className="max-w-3xl mx-auto p-6 md:p-8">
        <Link to="/issues" className="inline-flex items-center gap-1.5 text-sm mb-5" style={{ color: C.muted }}>
          <ArrowLeft className="w-4 h-4" /> Back to issues
        </Link>

        <h1 className="text-2xl font-bold mb-1">Submit a new issue</h1>
        <p className="text-sm mb-6" style={{ color: C.muted }}>
          Pick the right department so the issue reaches the right team.
        </p>

        <form onSubmit={onSubmit} className="space-y-5">
          <div className="p-5 rounded-xl border" style={{ backgroundColor: C.surface, borderColor: C.border }}>
            <label className="block text-sm font-medium mb-1.5">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief summary of your issue"
              maxLength={200}
              className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none"
              style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-5 rounded-xl border" style={{ backgroundColor: C.surface, borderColor: C.border }}>
              <label className="block text-sm font-medium mb-1.5">Department</label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none"
                style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
              >
                {departments.length === 0 && <option value="">No departments available</option>}
                {departments.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.code} — {d.name}
                  </option>
                ))}
              </select>
              <p className="text-xs mt-1.5" style={{ color: C.muted }}>
                SFC = Student Facilitation Center, IT = Tech support, HOD = Head of Department
              </p>
            </div>

            <div className="p-5 rounded-xl border" style={{ backgroundColor: C.surface, borderColor: C.border }}>
              <label className="block text-sm font-medium mb-1.5">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none"
                style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="p-5 rounded-xl border" style={{ backgroundColor: C.surface, borderColor: C.border }}>
            <label className="block text-sm font-medium mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              placeholder="Describe your issue in detail. Include relevant dates, IDs, screenshots references."
              className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none resize-y"
              style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
            />
          </div>

          <div className="p-5 rounded-xl border" style={{ backgroundColor: C.surface, borderColor: C.border }}>
            <label className="block text-sm font-medium mb-1.5">Attachments (optional)</label>
            <p className="text-xs mb-3" style={{ color: C.muted }}>
              PDF or image. Max {MAX_FILES} files, 5MB each.
            </p>
            <label
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm"
              style={{ borderColor: C.border, color: C.text }}
            >
              <Upload className="w-4 h-4" /> Add files
              <input
                type="file"
                multiple
                accept="application/pdf,image/*"
                onChange={onFileChange}
                className="hidden"
              />
            </label>
            {files.length > 0 && (
              <ul className="mt-3 space-y-2">
                {files.map((f, idx) => (
                  <li
                    key={idx}
                    className="flex items-center justify-between px-3 py-2 rounded-lg border text-sm"
                    style={{ borderColor: C.border, backgroundColor: C.input }}
                  >
                    <span className="inline-flex items-center gap-2 truncate">
                      {f.type === "application/pdf" ? (
                        <FileText className="w-4 h-4 shrink-0" />
                      ) : (
                        <ImageIcon className="w-4 h-4 shrink-0" />
                      )}
                      <span className="truncate">{f.name}</span>
                      <span style={{ color: C.muted }}>({(f.size / 1024).toFixed(0)} KB)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      style={{ color: C.muted }}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting || departments.length === 0}
              className="px-5 py-2.5 rounded-lg text-white font-medium text-sm disabled:opacity-60"
              style={{ backgroundColor: C.navy }}
            >
              {submitting ? "Submitting…" : "Submit issue"}
            </button>
            <Link
              to="/issues"
              className="px-5 py-2.5 rounded-lg border font-medium text-sm"
              style={{ borderColor: C.border, color: C.text }}
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateIssue;
