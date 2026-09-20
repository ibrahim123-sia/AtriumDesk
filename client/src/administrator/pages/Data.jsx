import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  Plus,
  Search,
  Upload,
  Trash2,
  Database,
  X,
  FileText,
  Save,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  fetchChunks,
  getChunk,
  addChunk,
  updateChunk,
  deleteChunk,
  uploadDocument,
  clearSelectedChunk,
} from "../../redux/slices/adminDataSlice";
import AdminTable, { AdminTableRow, AdminTableCell } from "../components/AdminTable";
import LoadingSkeleton from "../components/LoadingSkeleton";
import EmptyState from "../components/EmptyState";
import Pagination from "../components/Pagination";
import AdminModal from "../components/AdminModal";
import ConfirmDialog from "../components/ConfirmDialog";
import ContentSourceScraper from "../components/ContentSourceScraper";
import { getPalette } from "../utils/palette";

const PAGE_SIZE = 25;

const Data = () => {
  const dispatch = useDispatch();
  const theme = useSelector((s) => s.theme.theme);
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const C = getPalette(theme === "dark", tenantBranding);
  const { chunks, total, loading, selected, detailLoading, submitting } = useSelector(
    (s) => s.adminData
  );

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editText, setEditText] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ text: "", source: "" });
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadSource, setUploadSource] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);

  const reload = () => dispatch(fetchChunks({ search, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }));

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page]);

  useEffect(() => { setPage(1); }, [search]);

  const openDetail = async (id) => {
    setDrawerOpen(true);
    const result = await dispatch(getChunk(id)).unwrap();
    if (result.success) setEditText(result.chunk.text);
  };

  const closeDetail = () => {
    setDrawerOpen(false);
    dispatch(clearSelectedChunk());
    setEditText("");
  };

  const doSave = async () => {
    if (!selected) return;
    const result = await dispatch(updateChunk({ id: selected.id, text: editText })).unwrap();
    if (result.success) {
      toast.success("Chunk updated");
      reload();
    } else {
      toast.error(result.message || "Update failed");
    }
  };

  const doAdd = async (e) => {
    e.preventDefault();
    if (!addForm.text.trim()) {
      toast.error("Text is required");
      return;
    }
    const result = await dispatch(addChunk(addForm)).unwrap();
    if (result.success) {
      toast.success("Chunk added");
      setAddForm({ text: "", source: "" });
      setAddOpen(false);
      reload();
    } else {
      toast.error(result.message || "Failed to add");
    }
  };

  const doUpload = async (e) => {
    e.preventDefault();
    if (!uploadFile) {
      toast.error("Choose a file");
      return;
    }
    const result = await dispatch(uploadDocument({ file: uploadFile, source: uploadSource })).unwrap();
    if (result.success) {
      toast.success(`Added ${result.chunks_added} chunks from ${result.filename}`);
      setUploadFile(null);
      setUploadSource("");
      setUploadOpen(false);
      reload();
    } else {
      toast.error(result.message || "Upload failed");
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    const result = await dispatch(deleteChunk(confirmDelete.id)).unwrap();
    if (result.success) {
      toast.success("Chunk deleted");
      setConfirmDelete(null);
      if (selected && selected.id === confirmDelete.id) closeDetail();
      reload();
    } else {
      toast.error(result.message || "Delete failed");
    }
  };

  return (
    <div className="space-y-4">
      <ContentSourceScraper />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: C.muted }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chunk content..."
            className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border focus:outline-none"
            style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
          />
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="px-4 py-2.5 text-sm rounded-lg font-medium text-white flex items-center gap-2"
          style={{ backgroundColor: C.navy }}
        >
          <Plus className="w-4 h-4" />
          Add Chunk
        </button>
        <button
          onClick={() => setUploadOpen(true)}
          className="px-4 py-2.5 text-sm rounded-lg font-medium flex items-center gap-2 border"
          style={{ borderColor: C.border, color: C.text, backgroundColor: C.surface }}
        >
          <Upload className="w-4 h-4" />
          Upload Document
        </button>
      </div>

      <AdminTable
        columns={[
          { key: "id", label: "ID", width: 180 },
          { key: "preview", label: "Preview" },
          { key: "source", label: "Source" },
          { key: "length", label: "Length" },
          { key: "actions", label: "" },
        ]}
      >
        {loading ? (
          <LoadingSkeleton cols={5} />
        ) : chunks.length === 0 ? (
          <tbody>
            <tr>
              <td colSpan={5}>
                <EmptyState
                  icon={Database}
                  title="No chunks found"
                  description={search ? "Try a different search." : "Add a chunk or upload a document to start."}
                />
              </td>
            </tr>
          </tbody>
        ) : (
          <tbody>
            {chunks.map((c) => (
              <AdminTableRow key={c.id} onClick={() => openDetail(c.id)}>
                <AdminTableCell>
                  <span className="font-mono text-xs truncate" style={{ color: C.muted }}>{c.id}</span>
                </AdminTableCell>
                <AdminTableCell>
                  <p className="text-sm line-clamp-2" style={{ color: C.text }}>{c.preview}</p>
                </AdminTableCell>
                <AdminTableCell>
                  <span className="text-xs truncate inline-block max-w-[180px]" style={{ color: C.muted }}>
                    {c.source}
                  </span>
                </AdminTableCell>
                <AdminTableCell>
                  <span className="text-xs" style={{ color: C.muted }}>{c.length} ch</span>
                </AdminTableCell>
                <AdminTableCell>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(c); }}
                    className="p-1.5 rounded transition-colors"
                    style={{ color: C.muted }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = C.red)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = C.muted)}
                    aria-label="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </tbody>
        )}
      </AdminTable>

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />

      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex" onClick={closeDetail}>
          <div className="flex-1" style={{ backgroundColor: "rgba(15, 22, 38, 0.5)" }} />
          <aside
            className="w-full sm:w-[560px] h-full overflow-y-auto border-l flex flex-col"
            style={{ backgroundColor: C.surface, borderColor: C.border }}
            onClick={(e) => e.stopPropagation()}
          >
            <header
              className="px-5 py-4 border-b flex items-center justify-between sticky top-0 z-10"
              style={{ borderColor: C.border, backgroundColor: C.surface }}
            >
              <h2 className="text-base font-semibold" style={{ color: C.text }}>Edit chunk</h2>
              <button onClick={closeDetail} className="p-1 rounded" style={{ color: C.muted }}>
                <X className="w-5 h-5" />
              </button>
            </header>
            <div className="p-5 space-y-4 flex-1">
              {detailLoading && <p className="text-sm" style={{ color: C.muted }}>Loading...</p>}
              {selected && (
                <>
                  <div>
                    <p className="text-xs font-mono mb-1" style={{ color: C.muted }}>{selected.id}</p>
                    <p className="text-xs" style={{ color: C.muted }}>
                      Source: {selected.source || "—"}
                    </p>
                  </div>
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={18}
                    className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none font-mono"
                    style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
                  />
                </>
              )}
            </div>
            <footer
              className="px-5 py-3 border-t flex justify-end gap-2"
              style={{ borderColor: C.border, backgroundColor: C.surface }}
            >
              <button
                onClick={() => setConfirmDelete(selected)}
                disabled={!selected}
                className="px-3 py-2 text-sm rounded-lg border flex items-center gap-2 disabled:opacity-50"
                style={{ borderColor: `${C.red}55`, color: C.red }}
              >
                <Trash2 className="w-4 h-4" /> Delete
              </button>
              <button
                onClick={doSave}
                disabled={submitting || !selected}
                className="px-3 py-2 text-sm rounded-lg font-medium text-white flex items-center gap-2 disabled:opacity-50"
                style={{ backgroundColor: C.navy }}
              >
                <Save className="w-4 h-4" /> {submitting ? "Saving..." : "Save"}
              </button>
            </footer>
          </aside>
        </div>
      )}

      <AdminModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add Chunk"
        size="lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              className="px-3 py-2 text-sm rounded-lg border"
              style={{ borderColor: C.border, color: C.text }}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="add-chunk-form"
              disabled={submitting}
              className="px-3 py-2 text-sm rounded-lg font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: C.navy }}
            >
              {submitting ? "Adding..." : "Add chunk"}
            </button>
          </>
        }
      >
        <form id="add-chunk-form" onSubmit={doAdd} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>
              Source (optional)
            </label>
            <input
              type="text"
              value={addForm.source}
              onChange={(e) => setAddForm({ ...addForm, source: e.target.value })}
              placeholder="e.g. fee-structure-2026"
              className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none"
              style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>
              Text
            </label>
            <textarea
              value={addForm.text}
              onChange={(e) => setAddForm({ ...addForm, text: e.target.value })}
              rows={12}
              required
              className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none font-mono"
              style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
            />
          </div>
        </form>
      </AdminModal>

      <AdminModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Upload Document"
        footer={
          <>
            <button
              type="button"
              onClick={() => setUploadOpen(false)}
              className="px-3 py-2 text-sm rounded-lg border"
              style={{ borderColor: C.border, color: C.text }}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="upload-doc-form"
              disabled={submitting}
              className="px-3 py-2 text-sm rounded-lg font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: C.navy }}
            >
              {submitting ? "Uploading..." : "Upload"}
            </button>
          </>
        }
      >
        <form id="upload-doc-form" onSubmit={doUpload} className="space-y-4">
          <p className="text-sm" style={{ color: C.muted }}>
            Upload a PDF, DOCX, or TXT file. The server will split it into chunks and embed them automatically.
          </p>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>
              File
            </label>
            <label
              className="flex items-center justify-center gap-2 px-4 py-6 border-2 border-dashed rounded-lg cursor-pointer"
              style={{ borderColor: C.border, color: C.muted }}
            >
              <FileText className="w-5 h-5" />
              <span className="text-sm">{uploadFile ? uploadFile.name : "Choose file..."}</span>
              <input
                type="file"
                accept=".pdf,.docx,.txt"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                className="hidden"
              />
            </label>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>
              Source label (optional)
            </label>
            <input
              type="text"
              value={uploadSource}
              onChange={(e) => setUploadSource(e.target.value)}
              placeholder="defaults to filename"
              className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none"
              style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
            />
          </div>
        </form>
      </AdminModal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={doDelete}
        destructive
        title="Delete chunk?"
        message="This will permanently remove the chunk from the vector store. The chatbot will no longer use it."
        confirmLabel="Delete"
      />
    </div>
  );
};

export default Data;
