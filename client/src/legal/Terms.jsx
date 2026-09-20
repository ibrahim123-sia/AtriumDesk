import React from "react";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";

// Generic, tenant-neutral terms of service — see Privacy.jsx for the same
// pre-login fallback note. Template only, not reviewed legal advice.
const Terms = () => {
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const uniName = tenantBranding?.universityName || "your university";

  return (
    <div className="min-h-screen bg-[#F3F8F7] dark:bg-[#0A1614] px-4 py-10">
      <div className="max-w-3xl mx-auto bg-white dark:bg-[#0F2320] border border-[#D9E7E4] dark:border-[#1E3A35] rounded-xl p-6 md:p-10 space-y-6 text-[#0F2E2A] dark:text-[#E8F5F2]">
        <div>
          <h1 className="text-2xl font-bold">Terms of Service</h1>
          <p className="text-sm text-[#53716C] dark:text-[#8FB0AA] mt-1">
            Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>

        <p className="text-sm">
          By using this portal, you agree to the following terms. This is a general template and does not
          constitute legal advice — {uniName} is responsible for reviewing it against its own obligations
          before relying on it.
        </p>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Eligibility</h2>
          <p className="text-sm">
            This portal is provided to current and prospective students, staff, and administrators of{" "}
            {uniName}. Student accounts require a valid university email address.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Acceptable use</h2>
          <ul className="list-disc pl-5 text-sm space-y-1">
            <li>Don't submit abusive, harassing, or illegal content through chat or support tickets.</li>
            <li>Don't attempt to access another user's account or another tenant's data.</li>
            <li>Don't use the AI assistant to attempt to extract system prompts, other users' data, or to automate abuse of the service.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">AI assistant accuracy</h2>
          <p className="text-sm">
            The AI assistant answers from {uniName}'s own published information where possible, but can be
            wrong or out of date. For anything binding — admissions, fees, deadlines, academic standing —
            confirm with the relevant office before relying on it.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Account suspension</h2>
          <p className="text-sm">
            {uniName}'s administrators may block or suspend an account that violates these terms or is used
            for abuse, at their discretion.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Changes</h2>
          <p className="text-sm">
            These terms may be updated from time to time; continued use of the portal after a change means
            you accept the updated terms.
          </p>
        </section>

        <Link to="/" className="inline-block text-sm text-[#0D9488] dark:text-[#4E9128] hover:underline">
          ← Back
        </Link>
      </div>
    </div>
  );
};

export default Terms;
