import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { Download, ShieldCheck, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import axios from "../utils/axios";
import { logoutUser } from "../redux/slices/authSlice";

// Rev 5 §13.3 — a student can take a copy of everything held about them,
// or delete their account.
const YourDataCard = ({ C }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const token = useSelector((s) => s.auth.token);
  const [downloading, setDownloading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  const download = async () => {
    setDownloading(true);
    try {
      const { data } = await axios.get("/api/user/me/export", {
        headers: { Authorization: token },
        responseType: "blob",
      });
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `my-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Couldn't prepare your data — please try again");
    } finally {
      setDownloading(false);
    }
  };

  const onDelete = async (e) => {
    e.preventDefault();
    if (!password) return;
    setDeleting(true);
    try {
      await axios.post("/api/user/me/delete", { password }, { headers: { Authorization: token } });
      toast.success("Your account has been deleted.");
      await dispatch(logoutUser());
      navigate("/", { replace: true });
    } catch (error) {
      toast.error(error.response?.data?.message || "Couldn't delete your account");
      setDeleting(false);
    }
  };

  return (
    <section className="p-6 rounded-xl border space-y-4" style={{ backgroundColor: C.surface, borderColor: C.border }}>
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4" style={{ color: C.navy }} />
        <h2 className="text-base font-semibold">Your data</h2>
      </div>
      <p className="text-xs" style={{ color: C.muted }}>
        Download a copy of everything we hold about you — profile, chats, issues, saved items and notifications.
      </p>
      <button
        type="button"
        onClick={download}
        disabled={downloading}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium disabled:opacity-60"
        style={{ borderColor: C.border, color: C.text }}
      >
        <Download className="w-4 h-4" /> {downloading ? "Preparing…" : "Download my data"}
      </button>

      <div className="pt-4 border-t" style={{ borderColor: C.border }}>
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-2 text-sm font-medium"
            style={{ color: C.red }}
          >
            <Trash2 className="w-4 h-4" /> Delete my account
          </button>
        ) : (
          <form onSubmit={onDelete} className="space-y-3">
            <p className="text-sm" style={{ color: C.text }}>
              This permanently deletes your account, profile, chats, saved items and notifications. Issues you filed
              stay with the departments that handled them, with your name and email removed. This can't be undone.
            </p>
            <div>
              <label htmlFor="delete-password" className="text-xs font-semibold uppercase block mb-1.5" style={{ color: C.muted }}>
                Your password
              </label>
              <input
                id="delete-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full max-w-xs px-3 py-2 rounded-lg border text-sm focus:outline-none"
                style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                type="submit"
                disabled={deleting || !password}
                className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60"
                style={{ backgroundColor: C.red }}
              >
                {deleting ? "Deleting…" : "Delete my account permanently"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  setPassword("");
                }}
                className="px-4 py-2 rounded-lg border text-sm"
                style={{ borderColor: C.border, color: C.text }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
};

export default YourDataCard;
