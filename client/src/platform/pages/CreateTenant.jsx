import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-hot-toast";
import { ArrowLeft, Upload } from "lucide-react";
import { getPalette } from "../../administrator/utils/palette";
import { createTenant } from "../../redux/slices/platformSlice";

const FEATURES = [
  { key: "scholarships", label: "Scholarships" },
  { key: "jobs", label: "Jobs" },
  { key: "events", label: "Events" },
  { key: "chatbot", label: "Chatbot" },
];

// Defined at module scope, not inside CreateTenant — a component declared
// inside another component's body is a NEW function identity every render,
// so React treats it as a different component type and remounts the <input>
// (destroying focus) on every keystroke instead of just updating it.
const Field = ({ label, C, ...props }) => (
  <div>
    <label className="text-xs font-medium" style={{ color: C.muted }}>{label}</label>
    <input
      {...props}
      className="w-full mt-1 px-3 py-2 text-sm rounded-lg border focus:outline-none"
      style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
    />
  </div>
);

// Rev7 §6/T2 — "full tenant-creation wizard (replaces manual seedAdmin.js +
// .env editing)." One form: tenant identity + branding (logo/theme, per
// explicit user request) + which modules it gets + its first Administrator.
const CreateTenant = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const theme = useSelector((s) => s.theme.theme);
  const C = getPalette(theme === "dark");
  const { creating } = useSelector((s) => s.platform);

  const [form, setForm] = useState({
    slug: "", name: "", emailDomains: "", staffEmailDomainPattern: "",
    adminName: "", adminEmail: "", adminPassword: "",
    universityShort: "", primaryColor: "", supportEmail: "",
  });
  const [enabledFeatures, setEnabledFeatures] = useState({
    scholarships: true, jobs: true, events: true, chatbot: true,
  });
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0];
    setLogoFile(file || null);
    setLogoPreview(file ? URL.createObjectURL(file) : null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await dispatch(createTenant({
      slug: form.slug, name: form.name,
      emailDomains: form.emailDomains, staffEmailDomainPattern: form.staffEmailDomainPattern,
      adminName: form.adminName, adminEmail: form.adminEmail, adminPassword: form.adminPassword,
      branding: {
        universityName: form.name,
        universityShort: form.universityShort,
        primaryColor: form.primaryColor,
        supportEmail: form.supportEmail,
      },
      enabledFeatures,
      logoFile,
    })).unwrap();

    if (result.success) {
      toast.success(`Tenant "${result.tenant.name}" created`);
      navigate(`/platform/tenants/${result.tenant.slug}`, { replace: true });
    } else {
      toast.error(result.message || "Failed to create tenant");
    }
  };

  return (
    <div className="max-w-2xl space-y-5">
      <Link to="/platform/tenants" className="inline-flex items-center gap-1.5 text-sm" style={{ color: C.muted }}>
        <ArrowLeft className="w-4 h-4" /> Back to tenants
      </Link>
      <h1 className="text-xl font-bold" style={{ color: C.text }}>New Tenant</h1>

      <form onSubmit={handleSubmit} className="p-6 rounded-xl border space-y-5" style={{ backgroundColor: C.surface, borderColor: C.border }}>
        <div>
          <p className="text-xs font-semibold uppercase mb-2" style={{ color: C.muted }}>University</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Slug (e.g. bahria)" name="slug" required pattern="[a-z0-9-]+" value={form.slug} onChange={set("slug")} C={C} />
            <Field label="Full name" name="name" required value={form.name} onChange={set("name")} C={C} />
            <Field label="Short name (e.g. NUST)" name="universityShort" value={form.universityShort} onChange={set("universityShort")} C={C} />
            <Field label="Primary color (hex)" name="primaryColor" placeholder="#0D9488" value={form.primaryColor} onChange={set("primaryColor")} C={C} />
            <Field label="Student email domains (comma-separated)" name="emailDomains" placeholder="bahria.edu.pk" value={form.emailDomains} onChange={set("emailDomains")} C={C} />
            <Field label="Staff email pattern" name="staffEmailDomainPattern" placeholder="bahria.{dept}.edu" value={form.staffEmailDomainPattern} onChange={set("staffEmailDomainPattern")} C={C} />
            <Field label="Support email" name="supportEmail" value={form.supportEmail} onChange={set("supportEmail")} C={C} />
            <div>
              <label className="text-xs font-medium" style={{ color: C.muted }}>Logo</label>
              <label
                className="mt-1 flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm"
                style={{ backgroundColor: C.input, borderColor: C.border, color: C.muted }}
              >
                <Upload className="w-4 h-4" />
                {logoFile ? logoFile.name : "Choose an image…"}
                <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
              </label>
              {logoPreview && (
                <img src={logoPreview} alt="Logo preview" className="mt-2 h-10 w-10 rounded-lg object-contain border" style={{ borderColor: C.border }} />
              )}
            </div>
          </div>
        </div>

        <div className="pt-4 border-t" style={{ borderColor: C.border }}>
          <p className="text-xs font-semibold uppercase mb-2" style={{ color: C.muted }}>Enabled features</p>
          <div className="flex flex-wrap gap-4">
            {FEATURES.map(({ key, label }) => (
              <label key={key} className="inline-flex items-center gap-2 text-sm" style={{ color: C.text }}>
                <input
                  type="checkbox"
                  checked={enabledFeatures[key]}
                  onChange={(e) => setEnabledFeatures({ ...enabledFeatures, [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t" style={{ borderColor: C.border }}>
          <p className="text-xs font-semibold uppercase mb-2" style={{ color: C.muted }}>First Administrator</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Name" name="adminName" required value={form.adminName} onChange={set("adminName")} C={C} />
            <Field label="Email" name="adminEmail" type="email" required value={form.adminEmail} onChange={set("adminEmail")} C={C} />
            <Field label="Password" name="adminPassword" type="password" required minLength={6} value={form.adminPassword} onChange={set("adminPassword")} C={C} />
          </div>
        </div>

        <button
          type="submit"
          disabled={creating}
          className="px-5 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-60"
          style={{ backgroundColor: C.navy }}
        >
          {creating ? "Creating…" : "Create Tenant"}
        </button>
      </form>
    </div>
  );
};

export default CreateTenant;
