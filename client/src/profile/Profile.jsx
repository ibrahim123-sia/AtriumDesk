import React, { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  Camera,
  Lock,
  Mail,
  User as UserIcon,
  Building2,
  Shield,
  Eye,
  EyeOff,
  Save,
  GraduationCap,
  Briefcase,
  Globe2,
  CalendarClock,
  Bell,
  X as XIcon,
  FileUp,
  Sparkles,
} from "lucide-react";
import toast from "react-hot-toast";
import { updateProfile, updateProfileDetails, changePassword, parseCv } from "../redux/slices/authSlice";
import { getPalette } from "../administrator/utils/palette";

const FIELD_LABEL_CLASS = "text-xs font-semibold uppercase block mb-1";
const FIELD_HINT_CLASS = "text-xs mt-1";

// Defined at module scope, not inside Profile — a component declared
// inside another component's body is a new function identity every render,
// so React remounts the whole subtree (losing input focus) on every
// keystroke instead of just updating it. Same bug class fixed earlier in
// CreateTenant.jsx/Settings.jsx; this one affected all 17 academic/career
// profile fields (CGPA, skills, degree program, etc.) below.
const Field = ({ label, hint, C, children }) => (
  <div>
    <label className={FIELD_LABEL_CLASS} style={{ color: C.muted }}>
      {label}
    </label>
    {children}
    {hint && (
      <p className={FIELD_HINT_CLASS} style={{ color: C.muted }}>
        {hint}
      </p>
    )}
  </div>
);

// Comma/enter-separated tag input — used for skills, target countries,
// interests, society memberships (Rev 5 §5.1's list-valued fields).
const TagInput = ({ value, onChange, placeholder, C }) => {
  const [draft, setDraft] = useState("");
  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed]);
    setDraft("");
  };
  return (
    <div
      className="w-full px-2 py-1.5 rounded-lg border flex flex-wrap gap-1.5 items-center min-h-[42px]"
      style={{ backgroundColor: C.input, borderColor: C.border }}
    >
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
          style={{ backgroundColor: C.surfaceAlt, color: C.text }}
        >
          {tag}
          <button
            type="button"
            onClick={() => onChange(value.filter((t) => t !== tag))}
            style={{ color: C.muted }}
          >
            <XIcon className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
        placeholder={value.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[100px] bg-transparent text-sm focus:outline-none"
        style={{ color: C.text }}
      />
    </div>
  );
};

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3000";

const Profile = () => {
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);
  const theme = useSelector((s) => s.theme.theme);
  const isDark = theme === "dark";
  const tenantBranding = useSelector((s) => s.tenant.branding);

  const fileRef = useRef(null);
  const [name, setName] = useState(user?.name || "");
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // Revoke any pending object URL when the preview changes or the user
  // navigates away with an unsaved selection — prevents memory leaks.
  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  // Unified student profile (Rev 5 §5.1) — Core / Career / Study abroad /
  // Events / Notifications. Only rendered for students; staff/admin have no
  // academic profile to fill in.
  const p = user?.profile || {};
  const [core, setCore] = useState({
    degreeProgram: p.core?.degreeProgram || "",
    cgpa: p.core?.cgpa ?? "",
    currentSemester: p.core?.currentSemester ?? "",
    expectedGraduationDate: p.core?.expectedGraduationDate
      ? String(p.core.expectedGraduationDate).slice(0, 10)
      : "",
  });
  const [career, setCareer] = useState({
    skills: p.career?.skills || [],
    workModePreference: p.career?.workModePreference || "",
    preferredCity: p.career?.preferredCity || "",
    experienceLevel: p.career?.experienceLevel || "",
  });
  const [studyAbroad, setStudyAbroad] = useState({
    ieltsScore: p.studyAbroad?.ieltsScore ?? "",
    toeflScore: p.studyAbroad?.toeflScore ?? "",
    targetCountries: p.studyAbroad?.targetCountries || [],
    fundingPreference: p.studyAbroad?.fundingPreference || "",
    intendedFieldOfStudy: p.studyAbroad?.intendedFieldOfStudy || "",
  });
  const [eventsPref, setEventsPref] = useState({
    interests: p.events?.interests || [],
    societyMemberships: p.events?.societyMemberships || [],
  });
  const [notifPrefs, setNotifPrefs] = useState({
    digestFrequency: p.notifications?.digestFrequency || "off",
    deadlineReminderLeadDays: p.notifications?.deadlineReminderLeadDays ?? 7,
    unsubscribeAll: p.notifications?.unsubscribeAll || false,
  });
  const [savingDetails, setSavingDetails] = useState(false);

  // CV upload (Rev 5 §5.2 "Path A") — extract fields from an uploaded CV and
  // pre-fill the form above as an editable preview. Never auto-saved; the
  // student still has to review and click "Save changes".
  const cvRef = useRef(null);
  const [cvFile, setCvFile] = useState(null);
  const [parsingCv, setParsingCv] = useState(false);
  const [cvExtra, setCvExtra] = useState(null);

  const onPickCv = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const okType =
      file.type === "application/pdf" ||
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (!okType) {
      toast.error("CV must be a PDF or DOCX file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("CV must be under 5MB.");
      return;
    }
    setCvFile(file);
  };

  const onExtractCv = async () => {
    if (!cvFile) return;
    setParsingCv(true);
    const result = await dispatch(parseCv(cvFile)).unwrap();
    setParsingCv(false);
    if (!result.success) {
      toast.error(result.message || "Failed to parse CV");
      return;
    }
    const cv = result.cv || {};
    if (cv.degree_program) {
      setCore((c) => ({ ...c, degreeProgram: cv.degree_program }));
    }
    if (cv.cgpa != null) {
      setCore((c) => ({ ...c, cgpa: String(cv.cgpa) }));
    }
    if (Array.isArray(cv.skills) && cv.skills.length > 0) {
      setCareer((c) => ({
        ...c,
        skills: Array.from(new Set([...c.skills, ...cv.skills])),
      }));
    }
    setCvExtra(cv);
    setCvFile(null);
    if (cvRef.current) cvRef.current.value = "";
    toast.success("Extracted from CV — review the fields below, then save.");
  };

  const onSaveDetails = async (e) => {
    e.preventDefault();
    setSavingDetails(true);
    const result = await dispatch(
      updateProfileDetails({
        core: {
          degreeProgram: core.degreeProgram,
          cgpa: core.cgpa === "" ? null : Number(core.cgpa),
          currentSemester: core.currentSemester === "" ? null : Number(core.currentSemester),
          expectedGraduationDate: core.expectedGraduationDate || null,
        },
        career,
        studyAbroad: {
          ...studyAbroad,
          ieltsScore: studyAbroad.ieltsScore === "" ? null : Number(studyAbroad.ieltsScore),
          toeflScore: studyAbroad.toeflScore === "" ? null : Number(studyAbroad.toeflScore),
        },
        events: eventsPref,
        notifications: notifPrefs,
      })
    ).unwrap();
    setSavingDetails(false);
    if (result.success) {
      toast.success("Academic & career profile updated");
    } else {
      toast.error(result.message || "Failed to update profile details");
    }
  };

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [changingPw, setChangingPw] = useState(false);

  const C = getPalette(isDark, tenantBranding);

  const onPickAvatar = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file (JPG, PNG, WebP).");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be under 2MB.");
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const onSaveProfile = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast.error("Name must be at least 2 characters.");
      return;
    }
    if (trimmed === user.name && !avatarFile) {
      toast("Nothing to save.", { icon: "ℹ️" });
      return;
    }
    setSavingProfile(true);
    const result = await dispatch(
      updateProfile({
        name: trimmed === user.name ? undefined : trimmed,
        avatarFile,
      })
    ).unwrap();
    setSavingProfile(false);
    if (result.success) {
      toast.success("Profile updated");
      setAvatarFile(null);
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      setAvatarPreview(null);
    } else {
      toast.error(result.message || "Failed to update profile");
    }
  };

  const onChangePassword = async (e) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) {
      toast.error("Fill in both passwords.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New password and confirmation don't match.");
      return;
    }
    if (newPassword === currentPassword) {
      toast.error("New password must be different from the current one.");
      return;
    }
    setChangingPw(true);
    const result = await dispatch(
      changePassword({ currentPassword, newPassword })
    ).unwrap();
    setChangingPw(false);
    if (result.success) {
      toast.success("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } else {
      toast.error(result.message || "Failed to change password");
    }
  };

  const currentAvatarUrl =
    avatarPreview ||
    (user?.profilePicture ? `${SERVER_URL}${user.profilePicture}` : null);

  const roleLabel =
    user?.role === "admin" ? "Administrator" :
    user?.role === "staff" ? (user?.staffTitle || "Staff") :
    "Student";

  const isStudent = user?.role === "student" || !user?.role;

  const fieldClass = "w-full px-3 py-2 rounded-lg border text-sm focus:outline-none";

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: C.bg, color: C.text }}>
      <div className="max-w-3xl mx-auto p-6 md:p-8 space-y-6">
        <header>
          <h1 className="text-2xl font-bold">Your profile</h1>
          <p className="text-sm mt-1" style={{ color: C.muted }}>
            Manage your photo, display name, and password.
          </p>
        </header>

        {/* Profile card */}
        <form
          onSubmit={onSaveProfile}
          className="p-6 rounded-xl border space-y-5"
          style={{ backgroundColor: C.surface, borderColor: C.border }}
        >
          <div className="flex flex-wrap items-center gap-5">
            <div className="relative">
              <div
                className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center"
                style={{ backgroundColor: C.navy }}
              >
                {currentAvatarUrl ? (
                  <img src={currentAvatarUrl} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white font-bold text-3xl">
                    {user?.name?.charAt(0)?.toUpperCase() || "U"}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full flex items-center justify-center shadow-md border-2"
                style={{ backgroundColor: C.surface, borderColor: C.border, color: C.text }}
                title="Change profile picture"
              >
                <Camera className="w-4 h-4" />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onPickAvatar}
              />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-lg font-semibold truncate">{user?.name}</p>
              <p className="text-sm" style={{ color: C.muted }}>{user?.email}</p>
              <p className="text-xs mt-1 inline-flex items-center gap-1.5" style={{ color: C.muted }}>
                <Shield className="w-3.5 h-3.5" /> {roleLabel}
                {user?.department?.code && (
                  <>
                    <span>·</span>
                    <Building2 className="w-3.5 h-3.5" /> {user.department.code}
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase block mb-1.5" style={{ color: C.muted }}>
                Display name
              </label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: C.muted }} />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 rounded-lg border text-sm focus:outline-none"
                  style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase block mb-1.5" style={{ color: C.muted }}>
                Email (read-only)
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: C.muted }} />
                <input
                  type="email"
                  value={user?.email || ""}
                  readOnly
                  className="w-full pl-10 pr-3 py-2 rounded-lg border text-sm focus:outline-none"
                  style={{ backgroundColor: C.surfaceAlt, borderColor: C.border, color: C.muted }}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center pt-1 flex-wrap gap-3">
            <p className="text-xs" style={{ color: C.muted }}>
              Image must be JPG/PNG/WebP and under 2MB.
            </p>
            <button
              type="submit"
              disabled={savingProfile || (name.trim() === user?.name && !avatarFile)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60"
              style={{ backgroundColor: C.navy }}
            >
              <Save className="w-4 h-4" />
              {savingProfile ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>

        {/* Academic & career profile (Rev 5 §5.1) — students only */}
        {isStudent && (
          <form
            onSubmit={onSaveDetails}
            className="p-6 rounded-xl border space-y-6"
            style={{ backgroundColor: C.surface, borderColor: C.border }}
          >
            <div>
              <div className="flex items-center gap-2">
                <GraduationCap className="w-4 h-4" style={{ color: C.navy }} />
                <h2 className="text-base font-semibold">Academic & career profile</h2>
              </div>
              <p className="text-xs mt-1" style={{ color: C.muted }}>
                Powers Scholarships and Jobs matching — fill in what you can, the rest is optional.
              </p>
            </div>

            {/* CV upload — extracts degree program, CGPA & skills into the
                fields below as an editable preview; nothing is saved until
                you click "Save changes". */}
            <div
              className="p-4 rounded-lg border flex flex-wrap items-center gap-3"
              style={{ backgroundColor: C.surfaceAlt, borderColor: C.border }}
            >
              <FileUp className="w-4 h-4 shrink-0" style={{ color: C.navy }} />
              <div className="flex-1 min-w-[200px]">
                <p className="text-sm font-medium">Fill in from your CV</p>
                <p className="text-xs" style={{ color: C.muted }}>
                  PDF or DOCX, under 5MB. We strip personal details (phone, email, address, ID) before
                  reading it — only degree/skills-type info is extracted.
                </p>
              </div>
              <input
                ref={cvRef}
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={onPickCv}
              />
              <button
                type="button"
                onClick={() => cvRef.current?.click()}
                className="px-3 py-2 rounded-lg border text-sm font-medium"
                style={{ borderColor: C.border, color: C.text }}
              >
                {cvFile ? cvFile.name : "Choose file"}
              </button>
              <button
                type="button"
                onClick={onExtractCv}
                disabled={!cvFile || parsingCv}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60"
                style={{ backgroundColor: C.navy }}
              >
                <Sparkles className="w-4 h-4" />
                {parsingCv ? "Extracting…" : "Extract from CV"}
              </button>
            </div>

            {cvExtra && (
              <div
                className="p-4 rounded-lg border text-xs space-y-1.5"
                style={{ backgroundColor: C.surfaceAlt, borderColor: C.border, color: C.muted }}
              >
                <p className="font-semibold" style={{ color: C.text }}>
                  Also found in your CV (not auto-filled above, for reference):
                </p>
                {cvExtra.university && <p>University: {cvExtra.university}</p>}
                {cvExtra.graduation_year && <p>Graduation year: {cvExtra.graduation_year}</p>}
                {cvExtra.work_experience?.length > 0 && (
                  <p>Work experience: {cvExtra.work_experience.join("; ")}</p>
                )}
                {cvExtra.projects?.length > 0 && <p>Projects: {cvExtra.projects.join("; ")}</p>}
                {cvExtra.certifications?.length > 0 && (
                  <p>Certifications: {cvExtra.certifications.join(", ")}</p>
                )}
                {cvExtra.languages?.length > 0 && <p>Languages: {cvExtra.languages.join(", ")}</p>}
              </div>
            )}

            {/* Core */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field C={C} label="Degree program">
                <input
                  type="text"
                  value={core.degreeProgram}
                  onChange={(e) => setCore({ ...core, degreeProgram: e.target.value })}
                  placeholder="BS Computer Science"
                  className={fieldClass}
                  style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
                />
              </Field>
              <Field C={C} label="Current semester">
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={core.currentSemester}
                  onChange={(e) => setCore({ ...core, currentSemester: e.target.value })}
                  className={fieldClass}
                  style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
                />
              </Field>
              <Field C={C} label="CGPA" hint="Used for scholarship & job eligibility checks.">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="4"
                  value={core.cgpa}
                  onChange={(e) => setCore({ ...core, cgpa: e.target.value })}
                  placeholder="3.4"
                  className={fieldClass}
                  style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
                />
              </Field>
              <Field C={C} label="Expected graduation date">
                <input
                  type="date"
                  value={core.expectedGraduationDate}
                  onChange={(e) => setCore({ ...core, expectedGraduationDate: e.target.value })}
                  className={fieldClass}
                  style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
                />
              </Field>
            </div>

            {/* Career */}
            <div className="pt-1 border-t space-y-4" style={{ borderColor: C.border }}>
              <div className="flex items-center gap-2 pt-4">
                <Briefcase className="w-3.5 h-3.5" style={{ color: C.navy }} />
                <h3 className="text-sm font-semibold">Career</h3>
              </div>
              <Field C={C} label="Skills" hint="Used for job matching and skill-gap analysis against a JD.">
                <TagInput
                  value={career.skills}
                  onChange={(v) => setCareer({ ...career, skills: v })}
                  placeholder="Type a skill and press Enter"
                  C={C}
                />
              </Field>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field C={C} label="Work mode preference">
                  <select
                    value={career.workModePreference}
                    onChange={(e) => setCareer({ ...career, workModePreference: e.target.value })}
                    className={fieldClass}
                    style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
                  >
                    <option value="">Any</option>
                    <option value="remote">Remote</option>
                    <option value="onsite">Onsite</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </Field>
                <Field C={C} label="Preferred city">
                  <input
                    type="text"
                    value={career.preferredCity}
                    onChange={(e) => setCareer({ ...career, preferredCity: e.target.value })}
                    placeholder="Karachi"
                    className={fieldClass}
                    style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
                  />
                </Field>
                <Field C={C} label="Experience level">
                  <select
                    value={career.experienceLevel}
                    onChange={(e) => setCareer({ ...career, experienceLevel: e.target.value })}
                    className={fieldClass}
                    style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
                  >
                    <option value="">Not set</option>
                    <option value="fresh_grad">Fresh graduate</option>
                    <option value="0-1">0–1 years</option>
                    <option value="1-3">1–3 years</option>
                    <option value="3-5">3–5 years</option>
                    <option value="5+">5+ years</option>
                  </select>
                </Field>
              </div>
            </div>

            {/* Study abroad */}
            <div className="pt-1 border-t space-y-4" style={{ borderColor: C.border }}>
              <div className="flex items-center gap-2 pt-4">
                <Globe2 className="w-3.5 h-3.5" style={{ color: C.navy }} />
                <h3 className="text-sm font-semibold">Study abroad</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field C={C} label="IELTS score" hint="Used for scholarship eligibility.">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="9"
                    value={studyAbroad.ieltsScore}
                    onChange={(e) => setStudyAbroad({ ...studyAbroad, ieltsScore: e.target.value })}
                    className={fieldClass}
                    style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
                  />
                </Field>
                <Field C={C} label="TOEFL score">
                  <input
                    type="number"
                    min="0"
                    max="120"
                    value={studyAbroad.toeflScore}
                    onChange={(e) => setStudyAbroad({ ...studyAbroad, toeflScore: e.target.value })}
                    className={fieldClass}
                    style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
                  />
                </Field>
              </div>
              <Field C={C} label="Target countries">
                <TagInput
                  value={studyAbroad.targetCountries}
                  onChange={(v) => setStudyAbroad({ ...studyAbroad, targetCountries: v })}
                  placeholder="Germany, UK…"
                  C={C}
                />
              </Field>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field C={C} label="Funding preference">
                  <select
                    value={studyAbroad.fundingPreference}
                    onChange={(e) => setStudyAbroad({ ...studyAbroad, fundingPreference: e.target.value })}
                    className={fieldClass}
                    style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
                  >
                    <option value="">Any</option>
                    <option value="fully_funded">Fully funded</option>
                    <option value="partial">Partial funding</option>
                    <option value="self_funded">Self-funded</option>
                  </select>
                </Field>
                <Field C={C} label="Intended field of study">
                  <input
                    type="text"
                    value={studyAbroad.intendedFieldOfStudy}
                    onChange={(e) => setStudyAbroad({ ...studyAbroad, intendedFieldOfStudy: e.target.value })}
                    placeholder="Computer Science"
                    className={fieldClass}
                    style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
                  />
                </Field>
              </div>
            </div>

            {/* Events */}
            <div className="pt-1 border-t space-y-4" style={{ borderColor: C.border }}>
              <div className="flex items-center gap-2 pt-4">
                <CalendarClock className="w-3.5 h-3.5" style={{ color: C.navy }} />
                <h3 className="text-sm font-semibold">Events & societies</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field C={C} label="Interests" hint="Personalizes which campus events you see first.">
                  <TagInput
                    value={eventsPref.interests}
                    onChange={(v) => setEventsPref({ ...eventsPref, interests: v })}
                    placeholder="Tech, sports…"
                    C={C}
                  />
                </Field>
                <Field C={C} label="Society memberships">
                  <TagInput
                    value={eventsPref.societyMemberships}
                    onChange={(v) => setEventsPref({ ...eventsPref, societyMemberships: v })}
                    placeholder="ACM, Debating Society…"
                    C={C}
                  />
                </Field>
              </div>
            </div>

            {/* Notifications */}
            <div className="pt-1 border-t space-y-4" style={{ borderColor: C.border }}>
              <div className="flex items-center gap-2 pt-4">
                <Bell className="w-3.5 h-3.5" style={{ color: C.navy }} />
                <h3 className="text-sm font-semibold">Notifications</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field C={C} label="Digest frequency" hint="No profile, no alerts — this needs at least CGPA or skills filled in above.">
                  <select
                    value={notifPrefs.digestFrequency}
                    onChange={(e) => setNotifPrefs({ ...notifPrefs, digestFrequency: e.target.value })}
                    className={fieldClass}
                    style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
                  >
                    <option value="off">Off</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </Field>
                <Field C={C} label="Deadline reminder lead time (days)">
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={notifPrefs.deadlineReminderLeadDays}
                    onChange={(e) =>
                      setNotifPrefs({ ...notifPrefs, deadlineReminderLeadDays: e.target.value })
                    }
                    className={fieldClass}
                    style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
                  />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm" style={{ color: C.text }}>
                <input
                  type="checkbox"
                  checked={notifPrefs.unsubscribeAll}
                  onChange={(e) => setNotifPrefs({ ...notifPrefs, unsubscribeAll: e.target.checked })}
                />
                Unsubscribe from all email notifications
              </label>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={savingDetails}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60"
                style={{ backgroundColor: C.navy }}
              >
                <Save className="w-4 h-4" />
                {savingDetails ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        )}

        {/* Change password card */}
        <form
          onSubmit={onChangePassword}
          className="p-6 rounded-xl border space-y-4"
          style={{ backgroundColor: C.surface, borderColor: C.border }}
        >
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4" style={{ color: C.navy }} />
            <h2 className="text-base font-semibold">Change password</h2>
          </div>
          <p className="text-xs" style={{ color: C.muted }}>
            You'll need your current password. Choose a new one of at least 6 characters.
          </p>

          <div>
            <label className="text-xs font-semibold uppercase block mb-1.5" style={{ color: C.muted }}>
              Current password
            </label>
            <div className="relative">
              <input
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 pr-10 rounded-lg border text-sm focus:outline-none"
                style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowCurrent((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded"
                style={{ color: C.muted }}
                aria-label={showCurrent ? "Hide password" : "Show password"}
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase block mb-1.5" style={{ color: C.muted }}>
                New password
              </label>
              <div className="relative">
                <input
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 pr-10 rounded-lg border text-sm focus:outline-none"
                  style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded"
                  style={{ color: C.muted }}
                  aria-label={showNew ? "Hide password" : "Show password"}
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase block mb-1.5" style={{ color: C.muted }}>
                Confirm new password
              </label>
              <input
                type={showNew ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
                autoComplete="new-password"
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs mt-1" style={{ color: C.red }}>
                  Passwords don't match.
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={
                changingPw ||
                !currentPassword ||
                !newPassword ||
                newPassword !== confirmPassword
              }
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60"
              style={{ backgroundColor: C.navy }}
            >
              <Lock className="w-4 h-4" />
              {changingPw ? "Updating…" : "Update password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Profile;
