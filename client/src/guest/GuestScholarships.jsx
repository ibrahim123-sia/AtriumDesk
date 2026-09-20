import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { GraduationCap, Calculator, Calendar } from "lucide-react";
import { fetchGuestListings, fetchGuestBranding } from "../redux/slices/guestSlice";
import { toggleTheme as toggleThemeAction } from "../redux/slices/themeSlice";
import GuestSidebar from "./GuestSidebar";
import { getPalette } from "../administrator/utils/palette";

const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];

const FeeCalculator = ({ theme, C, feePerCreditHour }) => {
  const [semester, setSemester] = useState(1);
  const [creditHours, setCreditHours] = useState("");
  const [scholarshipPct, setScholarshipPct] = useState("");
  const [result, setResult] = useState(null);

  const handleCalculate = (e) => {
    e.preventDefault();
    const hours = Number(creditHours);
    const pct = scholarshipPct === "" ? 0 : Number(scholarshipPct);
    if (!hours || hours <= 0) return;
    const gross = hours * feePerCreditHour;
    const discount = gross * (Math.min(Math.max(pct, 0), 100) / 100);
    setResult({ gross, discount, net: gross - discount });
  };

  return (
    <div
      className={`p-5 rounded-xl border ${
        theme === "dark" ? "border-[#1E3A35] bg-[#0F2320]" : "border-[#D9E7E4] bg-white"
      }`}
    >
      <div className="flex items-center gap-2 mb-4">
        <Calculator className="w-5 h-5 text-[#0D9488] dark:text-[#4E9128]" />
        <h2 className="text-base font-semibold text-[#0F2E2A] dark:text-[#E8F5F2]">
          Calculate Semester Fee
        </h2>
      </div>

      <form onSubmit={handleCalculate} className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: C.muted }}>
            Semester
          </label>
          <select
            value={semester}
            onChange={(e) => setSemester(Number(e.target.value))}
            className="w-full px-3 py-2 text-sm rounded-lg border"
            style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
          >
            {SEMESTERS.map((s) => (
              <option key={s} value={s}>
                Semester {s}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: C.muted }}>
            Credit hours this semester
          </label>
          <input
            type="number"
            min="1"
            step="1"
            value={creditHours}
            onChange={(e) => setCreditHours(e.target.value)}
            placeholder="e.g. 18"
            required
            className="w-full px-3 py-2 text-sm rounded-lg border"
            style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
          />
        </div>

        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: C.muted }}>
            Scholarship % (if any)
          </label>
          <input
            type="number"
            min="0"
            max="100"
            step="1"
            value={scholarshipPct}
            onChange={(e) => setScholarshipPct(e.target.value)}
            placeholder="0"
            className="w-full px-3 py-2 text-sm rounded-lg border"
            style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
          />
        </div>

        <div className="sm:col-span-3">
          <button
            type="submit"
            className="px-4 py-2 text-sm rounded-lg font-medium text-white"
            style={{ backgroundColor: C.navy || "#0D9488" }}
          >
            Calculate
          </button>
        </div>
      </form>

      {result && (
        <div
          className={`mt-4 p-4 rounded-lg text-sm space-y-1 ${
            theme === "dark" ? "bg-[#152E2A]" : "bg-[#F3F8F7]"
          }`}
        >
          <div className="flex justify-between">
            <span style={{ color: C.muted }}>Gross fee ({creditHours} credit hours × {feePerCreditHour}/hr)</span>
            <span className="font-medium" style={{ color: C.text }}>{result.gross.toLocaleString()}</span>
          </div>
          {result.discount > 0 && (
            <div className="flex justify-between">
              <span style={{ color: C.muted }}>Scholarship discount ({scholarshipPct}%)</span>
              <span className="font-medium text-[#4E9128] dark:text-[#84CC16]">
                −{result.discount.toLocaleString()}
              </span>
            </div>
          )}
          <div className="flex justify-between pt-2 border-t" style={{ borderColor: C.border }}>
            <span className="font-semibold" style={{ color: C.text }}>Net semester fee</span>
            <span className="font-bold text-base" style={{ color: C.text }}>{result.net.toLocaleString()}</span>
          </div>
          <p className="text-xs pt-1" style={{ color: C.muted }}>
            Estimate only, based on your university's per-credit-hour rate. Confirm the exact figure with
            the Student Financial Center before paying.
          </p>
        </div>
      )}
    </div>
  );
};

const GuestScholarships = () => {
  const dispatch = useDispatch();
  const theme = useSelector((s) => s.theme.theme);
  const listings = useSelector((s) => s.guest.listings);
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const feeConfig = useSelector((s) => s.tenant.feeConfig);
  const guestSessionId = useSelector((s) => s.guest.guestSessionId);
  const universityShort = tenantBranding?.universityShort || "your university";
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const C = getPalette(theme === "dark", tenantBranding);

  useEffect(() => {
    dispatch(fetchGuestListings());
    dispatch(fetchGuestBranding());
  }, [dispatch]);

  const toggleTheme = () => dispatch(toggleThemeAction());

  return (
    <div
      className={`flex h-screen ${
        theme === "dark" ? "bg-[#0A1614]" : "bg-linear-to-b from-[#D9F2EE] via-white to-[#F3F8F7]"
      }`}
    >
      <GuestSidebar
        activeTab="scholarships"
        isMenuOpen={isMenuOpen}
        setIsMenuOpen={setIsMenuOpen}
        theme={theme}
        toggleTheme={toggleTheme}
        guestSessionId={guestSessionId}
      />

      <div className="flex-1 overflow-y-auto">
        <header
          className={`md:hidden sticky top-0 z-10 border-b p-4 ${
            theme === "dark" ? "bg-[#0F2320]/95 border-[#1E3A35]" : "bg-white/95 border-[#D9E7E4]"
          }`}
        >
          <button onClick={() => setIsMenuOpen(true)} className="p-2 rounded-lg hover:bg-[#F3F8F7] dark:hover:bg-[#152E2A]">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: C.text }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </header>

        <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: C.text }}>
              <GraduationCap className="w-5 h-5 text-[#0D9488] dark:text-[#4E9128]" />
              {universityShort} Scholarships
            </h1>
            <p className="text-sm mt-1" style={{ color: C.muted }}>
              Financial aid and fee concessions offered by {universityShort}.
            </p>
          </div>

          {listings.scholarships.length === 0 ? (
            <div className={`text-center py-12 rounded-xl border ${theme === "dark" ? "border-[#1E3A35]" : "border-[#D9E7E4]"}`}>
              <p className="text-sm" style={{ color: C.muted }}>No scholarships published yet — check back soon.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {listings.scholarships.map((s) => (
                <div
                  key={s._id}
                  className={`p-4 rounded-xl border ${
                    theme === "dark" ? "border-[#1E3A35] bg-[#0F2320]" : "border-[#D9E7E4] bg-white"
                  }`}
                >
                  <p className="font-semibold" style={{ color: C.text }}>{s.title}</p>
                  {s.description && (
                    <p className="text-sm mt-1 line-clamp-3" style={{ color: C.muted }}>{s.description}</p>
                  )}
                  {s.deadline && (
                    <p className="text-xs mt-2 flex items-center gap-1" style={{ color: C.muted }}>
                      <Calendar className="w-3.5 h-3.5" /> Deadline: {new Date(s.deadline).toLocaleDateString()}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {feeConfig?.feePerCreditHour ? (
            <FeeCalculator theme={theme} C={C} feePerCreditHour={feeConfig.feePerCreditHour} />
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default GuestScholarships;
