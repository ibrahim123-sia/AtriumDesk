import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Save, Building2 } from "lucide-react";
import toast from "react-hot-toast";
import { fetchTenantSettings, updateTenantSettings } from "../../redux/slices/tenantSlice";
import { getPalette } from "../utils/palette";
import StudentEmailPatternBuilder from "../components/StudentEmailPatternBuilder";

// Defined at module scope, not inside Settings — a component declared
// inside another component's body is a new function identity every render,
// so React remounts the whole subtree (losing input focus) on every
// keystroke instead of just updating it. Same bug class fixed earlier in
// CreateTenant.jsx.
const Field = ({ label, hint, C, children }) => (
  <div>
    <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>
      {label}
    </label>
    {children}
    {hint && (
      <p className="text-xs mt-1" style={{ color: C.muted }}>
        {hint}
      </p>
    )}
  </div>
);

const emptyForm = {
  name: "",
  universityName: "",
  universityShort: "",
  logoUrl: "",
  primaryColor: "",
  supportEmail: "",
  emailDomains: "",
  staffEmailDomainPattern: "",
  studentEmailPattern: "",
  smtpFromEmail: "",
  smtpFromName: "",
  smtpAppPassword: "",
  ragConfidenceHigh: "",
  ragConfidenceLow: "",
  ragTopK: "",
  ragListingRelevance: "",
  ragListingConfident: "",
};

const Settings = () => {
  const dispatch = useDispatch();
  const theme = useSelector((s) => s.theme.theme);
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const C = getPalette(theme === "dark", tenantBranding);
  const { settings, loading, submitting } = useSelector((s) => s.tenant);

  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    dispatch(fetchTenantSettings());
  }, [dispatch]);

  useEffect(() => {
    if (!settings) return;
    setForm({
      name: settings.name || "",
      universityName: settings.branding?.universityName || "",
      universityShort: settings.branding?.universityShort || "",
      logoUrl: settings.branding?.logoUrl || "",
      primaryColor: settings.branding?.primaryColor || "",
      supportEmail: settings.branding?.supportEmail || "",
      emailDomains: (settings.emailDomains || []).join(", "),
      staffEmailDomainPattern: settings.staffEmailDomainPattern || "",
      studentEmailPattern: settings.studentEmailPattern || "",
      smtpFromEmail: settings.smtp?.fromEmail || "",
      smtpFromName: settings.smtp?.fromName || "",
      smtpAppPassword: "",
      ragConfidenceHigh: settings.ragConfig?.confidenceHigh ?? "",
      ragConfidenceLow: settings.ragConfig?.confidenceLow ?? "",
      ragTopK: settings.ragConfig?.topK ?? "",
      ragListingRelevance: settings.ragConfig?.listingRelevance ?? "",
      ragListingConfident: settings.ragConfig?.listingConfident ?? "",
    });
  }, [settings]);

  const appPasswordConfigured = settings?.smtp?.appPasswordConfigured;

  const handleChange = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const body = {
      name: form.name,
      branding: {
        universityName: form.universityName,
        universityShort: form.universityShort,
        logoUrl: form.logoUrl,
        primaryColor: form.primaryColor,
        supportEmail: form.supportEmail,
      },
      emailDomains: form.emailDomains
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean),
      staffEmailDomainPattern: form.staffEmailDomainPattern,
      studentEmailPattern: form.studentEmailPattern,
      smtp: {
        fromEmail: form.smtpFromEmail,
        fromName: form.smtpFromName,
        // Empty = "leave the currently-configured password alone" (never
        // round-tripped to the client, so an empty field here never means
        // "clear it").
        ...(form.smtpAppPassword ? { appPassword: form.smtpAppPassword } : {}),
      },
      ragConfig: {
        confidenceHigh: form.ragConfidenceHigh === "" ? null : form.ragConfidenceHigh,
        confidenceLow: form.ragConfidenceLow === "" ? null : form.ragConfidenceLow,
        topK: form.ragTopK === "" ? null : form.ragTopK,
        listingRelevance: form.ragListingRelevance === "" ? null : form.ragListingRelevance,
        listingConfident: form.ragListingConfident === "" ? null : form.ragListingConfident,
      },
    };
    const result = await dispatch(updateTenantSettings(body)).unwrap();
    if (result.success) {
      toast.success("Branding updated");
    } else {
      toast.error(result.message || "Failed to update branding");
    }
  };

  const inputStyle = {
    backgroundColor: C.input,
    borderColor: C.border,
    color: C.text,
  };
  const inputClass = "w-full px-3 py-2 text-sm rounded-lg border focus:outline-none";

  if (loading && !settings) {
    return <p style={{ color: C.muted }}>Loading tenant settings…</p>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Building2 className="w-5 h-5" style={{ color: C.navy }} />
        <p className="text-sm" style={{ color: C.muted }}>
          These fields control how AtriumDesk is branded for your university — logo, name and
          colors shown across the portal, plus which email domains route logins to your
          institution. Changes take effect immediately, no redeploy needed.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field C={C} label="University name (full)">
          <input
            type="text"
            value={form.universityName}
            onChange={handleChange("universityName")}
            placeholder="Muhammad Ali Jinnah University"
            className={inputClass}
            style={inputStyle}
          />
        </Field>

        <Field C={C} label="University name (short)" hint="Shown in the browser tab title.">
          <input
            type="text"
            value={form.universityShort}
            onChange={handleChange("universityShort")}
            placeholder="MAJU"
            className={inputClass}
            style={inputStyle}
          />
        </Field>

        <Field C={C} label="Logo URL">
          <input
            type="text"
            value={form.logoUrl}
            onChange={handleChange("logoUrl")}
            placeholder="https://…/logo.png"
            className={inputClass}
            style={inputStyle}
          />
        </Field>

        <Field C={C} label="Primary color" hint="Used as the accent color in outgoing emails.">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={form.primaryColor}
              onChange={handleChange("primaryColor")}
              placeholder="#0D9488"
              className={inputClass}
              style={inputStyle}
            />
            {form.primaryColor && (
              <span
                className="w-9 h-9 rounded-lg border flex-shrink-0"
                style={{ backgroundColor: form.primaryColor, borderColor: C.border }}
              />
            )}
          </div>
        </Field>

        <Field C={C} label="Support email">
          <input
            type="email"
            value={form.supportEmail}
            onChange={handleChange("supportEmail")}
            placeholder="support@youruniversity.edu"
            className={inputClass}
            style={inputStyle}
          />
        </Field>

        <Field C={C}
          label="Student email domains"
          hint="Comma-separated. Determines which university a login/registration email resolves to — must be unique across the platform."
        >
          <input
            type="text"
            value={form.emailDomains}
            onChange={handleChange("emailDomains")}
            placeholder="youruniversity.edu.pk"
            required
            className={inputClass}
            style={inputStyle}
          />
        </Field>

        <Field C={C}
          label="Staff email domain pattern"
          hint="{dept} is replaced with the department code when auto-generating staff emails."
        >
          <input
            type="text"
            value={form.staffEmailDomainPattern}
            onChange={handleChange("staffEmailDomainPattern")}
            placeholder="youruniversity.{dept}.edu"
            className={inputClass}
            style={inputStyle}
          />
        </Field>

        <Field C={C}
          label="Student email format (optional)"
          hint="Whatever you build below gets auto-filled into a student's profile (session/year/program/roll number) on registration."
        >
          <StudentEmailPatternBuilder
            value={form.studentEmailPattern}
            onChange={(pattern) => setForm({ ...form, studentEmailPattern: pattern })}
          />
        </Field>

        <div className="pt-4 border-t space-y-4" style={{ borderColor: C.border }}>
          <p className="text-sm font-medium" style={{ color: C.text }}>
            Email sending (for OTPs & notifications)
          </p>
          <p className="text-xs" style={{ color: C.muted }}>
            Leave blank to keep using the platform's default sender. Set your own to send OTP and
            notification emails from your own university's address instead.
          </p>

          <Field C={C} label="Sender email">
            <input
              type="email"
              value={form.smtpFromEmail}
              onChange={handleChange("smtpFromEmail")}
              placeholder="otp@youruniversity.edu"
              className={inputClass}
              style={inputStyle}
            />
          </Field>

          <Field C={C} label="Sender display name">
            <input
              type="text"
              value={form.smtpFromName}
              onChange={handleChange("smtpFromName")}
              placeholder="Your University"
              className={inputClass}
              style={inputStyle}
            />
          </Field>

          <Field C={C}
            label="App password"
            hint={
              appPasswordConfigured
                ? "A password is already configured. Leave blank to keep it, or enter a new one to replace it."
                : "A 16-character Gmail App Password (not your regular password) — Google Account → Security → App Passwords."
            }
          >
            <input
              type="password"
              value={form.smtpAppPassword}
              onChange={handleChange("smtpAppPassword")}
              placeholder={appPasswordConfigured ? "•••••••••••••••• (configured)" : "16-character app password"}
              className={inputClass}
              style={inputStyle}
              autoComplete="new-password"
            />
          </Field>
        </div>

        <div className="pt-4 border-t space-y-4" style={{ borderColor: C.border }}>
          <p className="text-sm font-medium" style={{ color: C.text }}>
            Chatbot answer tuning (advanced)
          </p>
          <p className="text-xs" style={{ color: C.muted }}>
            Leave blank to use the platform default. Only worth changing if your knowledge base is
            noticeably larger/smaller than typical and answers feel over- or under-confident.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <Field C={C} label="Confidence: high threshold" hint="0–1, default 0.55">
              <input type="number" step="0.01" min="0" max="1" value={form.ragConfidenceHigh}
                onChange={handleChange("ragConfidenceHigh")} placeholder="0.55" className={inputClass} style={inputStyle} />
            </Field>
            <Field C={C} label="Confidence: low threshold" hint="0–1, default 0.35">
              <input type="number" step="0.01" min="0" max="1" value={form.ragConfidenceLow}
                onChange={handleChange("ragConfidenceLow")} placeholder="0.35" className={inputClass} style={inputStyle} />
            </Field>
            <Field C={C} label="Chunks retrieved per question" hint="1–50, default 8">
              <input type="number" step="1" min="1" max="50" value={form.ragTopK}
                onChange={handleChange("ragTopK")} placeholder="8" className={inputClass} style={inputStyle} />
            </Field>
            <Field C={C} label="Listing relevance threshold" hint="0–1, default 0.30">
              <input type="number" step="0.01" min="0" max="1" value={form.ragListingRelevance}
                onChange={handleChange("ragListingRelevance")} placeholder="0.30" className={inputClass} style={inputStyle} />
            </Field>
            <Field C={C} label="Listing confident threshold" hint="0–1, default 0.55">
              <input type="number" step="0.01" min="0" max="1" value={form.ragListingConfident}
                onChange={handleChange("ragListingConfident")} placeholder="0.55" className={inputClass} style={inputStyle} />
            </Field>
          </div>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-sm rounded-lg font-medium text-white flex items-center gap-2 disabled:opacity-50"
            style={{ backgroundColor: C.navy }}
          >
            <Save className="w-4 h-4" />
            {submitting ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default Settings;
