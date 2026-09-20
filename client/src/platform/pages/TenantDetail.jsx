import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-hot-toast";
import { ArrowLeft, CheckCircle2, XCircle, Upload } from "lucide-react";
import axios from "../../utils/axios";
import { getPalette } from "../../administrator/utils/palette";
import { updateTenantBilling, updateTenantFeatures, updateTenant, fetchTenantAnalytics } from "../../redux/slices/platformSlice";
import StudentEmailPatternBuilder from "../../administrator/components/StudentEmailPatternBuilder";

const FEATURES = [
  { key: "scholarships", label: "Scholarships" },
  { key: "jobs", label: "Jobs" },
  { key: "events", label: "Events" },
  { key: "chatbot", label: "Chatbot" },
];

const TABS = [
  { key: "overview", label: "Overview & Edit" },
  { key: "analytics", label: "Analytics" },
  { key: "billing", label: "Billing" },
];

const TenantDetail = () => {
  const { slug } = useParams();
  const dispatch = useDispatch();
  const theme = useSelector((s) => s.theme.theme);
  const C = getPalette(theme === "dark");
  const platformToken = useSelector((s) => s.platformAuth.token);
  const tenant = useSelector((s) => s.platform.tenants.find((t) => t.slug === slug));
  const analytics = useSelector((s) => s.platform.tenantAnalytics);

  const [tab, setTab] = useState("overview");
  const [health, setHealth] = useState(null);
  const [billing, setBilling] = useState({ plan: "free", billingEmail: "", maxUsers: "" });
  const [enabledFeatures, setEnabledFeatures] = useState({ scholarships: true, jobs: true, events: true, chatbot: true });
  const [primaryColor, setPrimaryColor] = useState("");
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);

  // General-edit fields (Rev7 user request — Super Admin previously could
  // only fix these by impersonating the tenant's own Administrator).
  const [general, setGeneral] = useState({
    name: "", universityShort: "", supportEmail: "", emailDomains: "", staffEmailDomainPattern: "", studentEmailPattern: "",
  });

  useEffect(() => {
    if (tenant?.billing) {
      setBilling({
        plan: tenant.billing.plan || "free",
        billingEmail: tenant.billing.billingEmail || "",
        maxUsers: tenant.billing.maxUsers ?? "",
      });
    }
    if (tenant?.enabledFeatures) {
      setEnabledFeatures({
        scholarships: tenant.enabledFeatures.scholarships !== false,
        jobs: tenant.enabledFeatures.jobs !== false,
        events: tenant.enabledFeatures.events !== false,
        chatbot: tenant.enabledFeatures.chatbot !== false,
      });
    }
    setPrimaryColor(tenant?.branding?.primaryColor || "");
    if (tenant) {
      setGeneral({
        name: tenant.name || "",
        universityShort: tenant.branding?.universityShort || "",
        supportEmail: tenant.branding?.supportEmail || "",
        emailDomains: (tenant.emailDomains || []).join(", "),
        staffEmailDomainPattern: tenant.staffEmailDomainPattern || "",
        studentEmailPattern: tenant.studentEmailPattern || "",
      });
    }
  }, [tenant]);

  useEffect(() => {
    if (tab === "analytics") dispatch(fetchTenantAnalytics(slug));
  }, [tab, slug, dispatch]);

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0];
    setLogoFile(file || null);
    setLogoPreview(file ? URL.createObjectURL(file) : null);
  };

  const handleGeneralSave = async (e) => {
    e.preventDefault();
    const result = await dispatch(updateTenant({
      slug,
      name: general.name,
      branding: { universityShort: general.universityShort, supportEmail: general.supportEmail },
      emailDomains: general.emailDomains.split(",").map((d) => d.trim()).filter(Boolean),
      staffEmailDomainPattern: general.staffEmailDomainPattern,
      studentEmailPattern: general.studentEmailPattern,
    })).unwrap();
    if (result.success) toast.success("Tenant settings updated");
    else toast.error(result.message);
  };

  const handleFeaturesSave = async (e) => {
    e.preventDefault();
    const result = await dispatch(updateTenantFeatures({ slug, enabledFeatures, logoFile, primaryColor })).unwrap();
    if (result.success) {
      toast.success("Branding & features updated");
      setLogoFile(null);
      setLogoPreview(null);
    } else {
      toast.error(result.message);
    }
  };

  useEffect(() => {
    axios.get(`/api/platform/tenants/${slug}/health`, { headers: { Authorization: platformToken } })
      .then(({ data }) => setHealth(data.health))
      .catch(() => setHealth(null));
  }, [slug, platformToken]);

  const handleBillingSave = async (e) => {
    e.preventDefault();
    const result = await dispatch(updateTenantBilling({
      slug, billing: { ...billing, maxUsers: billing.maxUsers === "" ? null : Number(billing.maxUsers) },
    })).unwrap();
    if (result.success) toast.success("Billing updated");
    else toast.error(result.message);
  };

  if (!tenant) {
    return (
      <div>
        <Link to="/platform/tenants" className="inline-flex items-center gap-1.5 text-sm" style={{ color: C.muted }}>
          <ArrowLeft className="w-4 h-4" /> Back to tenants
        </Link>
        <p className="text-sm mt-4" style={{ color: C.muted }}>Loading tenant…</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-5">
      <Link to="/platform/tenants" className="inline-flex items-center gap-1.5 text-sm" style={{ color: C.muted }}>
        <ArrowLeft className="w-4 h-4" /> Back to tenants
      </Link>
      <div>
        <h1 className="text-xl font-bold" style={{ color: C.text }}>{tenant.name}</h1>
        <p className="text-sm" style={{ color: C.muted }}>{tenant.slug} · {tenant.dbName}</p>
      </div>

      <div className="inline-flex rounded-lg border p-1" style={{ borderColor: C.border }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
            style={tab === t.key ? { backgroundColor: C.navy, color: "#fff" } : { color: C.muted }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div className="p-5 rounded-xl border space-y-3" style={{ backgroundColor: C.surface, borderColor: C.border }}>
            <p className="text-xs font-semibold uppercase" style={{ color: C.muted }}>Health</p>
            {health ? (
              <div className="space-y-1.5 text-sm">
                <p className="flex items-center gap-2" style={{ color: C.text }}>
                  {health.dbReachable ? <CheckCircle2 className="w-4 h-4" style={{ color: C.green }} /> : <XCircle className="w-4 h-4" style={{ color: C.red }} />}
                  Database: {health.dbReachable ? "reachable" : health.dbError}
                </p>
                <p style={{ color: C.muted }}>Chroma collection: {health.chromaCollection}</p>
              </div>
            ) : (
              <p className="text-sm" style={{ color: C.muted }}>Checking…</p>
            )}
          </div>

          <form onSubmit={handleGeneralSave} className="p-5 rounded-xl border space-y-3" style={{ backgroundColor: C.surface, borderColor: C.border }}>
            <p className="text-xs font-semibold uppercase" style={{ color: C.muted }}>General settings</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium" style={{ color: C.muted }}>Full name</label>
                <input
                  type="text" value={general.name}
                  onChange={(e) => setGeneral({ ...general, name: e.target.value })}
                  className="w-full mt-1 px-3 py-2 text-sm rounded-lg border focus:outline-none"
                  style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
                />
              </div>
              <div>
                <label className="text-xs font-medium" style={{ color: C.muted }}>Short name</label>
                <input
                  type="text" value={general.universityShort}
                  onChange={(e) => setGeneral({ ...general, universityShort: e.target.value })}
                  className="w-full mt-1 px-3 py-2 text-sm rounded-lg border focus:outline-none"
                  style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
                />
              </div>
              <div>
                <label className="text-xs font-medium" style={{ color: C.muted }}>Support email</label>
                <input
                  type="email" value={general.supportEmail}
                  onChange={(e) => setGeneral({ ...general, supportEmail: e.target.value })}
                  className="w-full mt-1 px-3 py-2 text-sm rounded-lg border focus:outline-none"
                  style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
                />
              </div>
              <div>
                <label className="text-xs font-medium" style={{ color: C.muted }}>Student email domains (comma-separated)</label>
                <input
                  type="text" value={general.emailDomains}
                  onChange={(e) => setGeneral({ ...general, emailDomains: e.target.value })}
                  placeholder="bahria.edu.pk"
                  className="w-full mt-1 px-3 py-2 text-sm rounded-lg border focus:outline-none"
                  style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
                />
              </div>
              <div>
                <label className="text-xs font-medium" style={{ color: C.muted }}>Staff email pattern</label>
                <input
                  type="text" value={general.staffEmailDomainPattern}
                  onChange={(e) => setGeneral({ ...general, staffEmailDomainPattern: e.target.value })}
                  placeholder="bahria.{dept}.edu"
                  className="w-full mt-1 px-3 py-2 text-sm rounded-lg border focus:outline-none"
                  style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: C.muted }}>Student email format</label>
              <StudentEmailPatternBuilder
                value={general.studentEmailPattern}
                onChange={(pattern) => setGeneral({ ...general, studentEmailPattern: pattern })}
              />
            </div>
            <button type="submit" className="px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: C.navy }}>
              Save general settings
            </button>
          </form>

          <form onSubmit={handleFeaturesSave} className="p-5 rounded-xl border space-y-3" style={{ backgroundColor: C.surface, borderColor: C.border }}>
            <p className="text-xs font-semibold uppercase" style={{ color: C.muted }}>Branding, features & logo</p>
            <div>
              <label className="text-xs font-medium" style={{ color: C.muted }}>Primary color (hex)</label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  placeholder="#0D9488"
                  className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none"
                  style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
                />
                {primaryColor && (
                  <span
                    className="h-9 w-9 rounded-lg border shrink-0"
                    style={{ backgroundColor: primaryColor, borderColor: C.border }}
                  />
                )}
              </div>
            </div>
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
            <div className="flex items-center gap-3">
              {(logoPreview || tenant.branding?.logoUrl) && (
                <img
                  src={logoPreview || tenant.branding.logoUrl}
                  alt="Logo"
                  className="h-10 w-10 rounded-lg object-contain border"
                  style={{ borderColor: C.border }}
                />
              )}
              <label
                className="flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm"
                style={{ backgroundColor: C.input, borderColor: C.border, color: C.muted }}
              >
                <Upload className="w-4 h-4" />
                {logoFile ? logoFile.name : "Replace logo…"}
                <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
              </label>
            </div>
            <button type="submit" className="px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: C.navy }}>
              Save branding & features
            </button>
          </form>
        </>
      )}

      {tab === "analytics" && (
        <div className="space-y-4">
          {!analytics ? (
            <p className="text-sm" style={{ color: C.muted }}>Loading analytics…</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {analytics.usersByRole.map((r) => (
                  <div key={r._id} className="p-3 rounded-xl border" style={{ backgroundColor: C.surface, borderColor: C.border }}>
                    <p className="text-xs uppercase" style={{ color: C.muted }}>{r._id}s</p>
                    <p className="text-lg font-bold" style={{ color: C.text }}>{r.count}</p>
                  </div>
                ))}
                <div className="p-3 rounded-xl border" style={{ backgroundColor: C.surface, borderColor: C.border }}>
                  <p className="text-xs uppercase" style={{ color: C.muted }}>Chats</p>
                  <p className="text-lg font-bold" style={{ color: C.text }}>{analytics.chatCount}</p>
                </div>
              </div>

              <div className="p-4 rounded-xl border" style={{ backgroundColor: C.surface, borderColor: C.border }}>
                <p className="text-xs font-semibold uppercase mb-2" style={{ color: C.muted }}>Issues by status</p>
                <div className="flex flex-wrap gap-3 text-sm">
                  {analytics.issuesByStatus.map((s) => (
                    <span key={s._id} style={{ color: C.text }}>{s._id}: <strong>{s.count}</strong></span>
                  ))}
                  {analytics.issuesByStatus.length === 0 && <span style={{ color: C.muted }}>No issues yet</span>}
                </div>
              </div>

              <div className="p-4 rounded-xl border" style={{ backgroundColor: C.surface, borderColor: C.border }}>
                <p className="text-xs font-semibold uppercase mb-2" style={{ color: C.muted }}>Listings</p>
                <div className="flex flex-wrap gap-3 text-sm">
                  {analytics.listingCounts.map((l) => (
                    <span key={l._id} style={{ color: C.text }}>{l._id}: <strong>{l.count}</strong></span>
                  ))}
                  {analytics.listingCounts.length === 0 && <span style={{ color: C.muted }}>No listings yet</span>}
                </div>
              </div>

              <div className="p-4 rounded-xl border" style={{ backgroundColor: C.surface, borderColor: C.border }}>
                <p className="text-xs font-semibold uppercase mb-2" style={{ color: C.muted }}>AI usage — last 30 days</p>
                {analytics.usageByDay.length === 0 ? (
                  <p className="text-sm" style={{ color: C.muted }}>No AI requests recorded yet.</p>
                ) : (
                  <div className="space-y-1 text-sm">
                    {analytics.usageByDay.map((d) => (
                      <div key={d._id} className="flex justify-between" style={{ color: C.text }}>
                        <span style={{ color: C.muted }}>{d._id}</span>
                        <span>{d.requests} requests · {d.tokens.toLocaleString()} tokens</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {tab === "billing" && (
        <form onSubmit={handleBillingSave} className="p-5 rounded-xl border space-y-3" style={{ backgroundColor: C.surface, borderColor: C.border }}>
          <p className="text-xs font-semibold uppercase" style={{ color: C.muted }}>Billing (schema only — no payment provider wired up)</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs" style={{ color: C.muted }}>Plan</label>
              <select
                value={billing.plan}
                onChange={(e) => setBilling({ ...billing, plan: e.target.value })}
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border"
                style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
              >
                <option value="free">Free</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div>
              <label className="text-xs" style={{ color: C.muted }}>Max users</label>
              <input
                type="number"
                value={billing.maxUsers}
                onChange={(e) => setBilling({ ...billing, maxUsers: e.target.value })}
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border"
                style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs" style={{ color: C.muted }}>Billing email</label>
              <input
                type="email"
                value={billing.billingEmail}
                onChange={(e) => setBilling({ ...billing, billingEmail: e.target.value })}
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border"
                style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
              />
            </div>
          </div>
          <button type="submit" className="px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: C.navy }}>
            Save billing
          </button>
        </form>
      )}
    </div>
  );
};

export default TenantDetail;
