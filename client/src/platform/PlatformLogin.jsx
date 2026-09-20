import React, { useState } from "react";
import { toast } from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { Mail, Lock, ShieldCheck } from "lucide-react";
import { loginSuperAdmin } from "../redux/slices/platformAuthSlice";
import { getPalette } from "../administrator/utils/palette";

// Rev7 §5.9 — a deliberately separate login page/domain from tenant login,
// never sharing a form, a token, or a route tree with /login.
const PlatformLogin = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const theme = useSelector((s) => s.theme.theme);
  const C = getPalette(theme === "dark");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const result = await dispatch(loginSuperAdmin({ email, password })).unwrap();
    setLoading(false);
    if (result.success) {
      navigate("/platform/dashboard", { replace: true });
    } else {
      toast.error(result.message || "Login failed");
    }
  };

  return (
    <div className="h-screen flex items-center justify-center" style={{ backgroundColor: C.bg }}>
      <form onSubmit={handleSubmit} className="w-full max-w-sm p-8 rounded-xl border space-y-5" style={{ backgroundColor: C.surface, borderColor: C.border }}>
        <div className="text-center space-y-1">
          <ShieldCheck className="w-8 h-8 mx-auto" style={{ color: C.navy }} />
          <h1 className="text-lg font-bold" style={{ color: C.text }}>AtriumDesk Platform</h1>
          <p className="text-xs" style={{ color: C.muted }}>Super Admin console</p>
        </div>

        <div>
          <label className="text-xs font-medium" style={{ color: C.muted }}>Email</label>
          <div className="relative mt-1">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: C.muted }} />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border focus:outline-none"
              style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium" style={{ color: C.muted }}>Password</label>
          <div className="relative mt-1">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: C.muted }} />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border focus:outline-none"
              style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-60"
          style={{ backgroundColor: C.navy }}
        >
          {loading ? "Signing in…" : "Sign In"}
        </button>
      </form>
    </div>
  );
};

export default PlatformLogin;
