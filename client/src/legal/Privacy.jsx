import React from "react";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";

// Generic, tenant-neutral privacy policy — falls back to "your university"
// pre-login (tenant branding isn't resolved yet at that point, same
// constraint as Login.jsx/Register.jsx's marketing copy). This is a
// reasonable starting template, not reviewed legal advice — a real
// deployment should have counsel review it before launch.
const Privacy = () => {
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const uniName = tenantBranding?.universityName || "your university";

  return (
    <div className="min-h-screen bg-[#F3F8F7] dark:bg-[#0A1614] px-4 py-10">
      <div className="max-w-3xl mx-auto bg-white dark:bg-[#0F2320] border border-[#D9E7E4] dark:border-[#1E3A35] rounded-xl p-6 md:p-10 space-y-6 text-[#0F2E2A] dark:text-[#E8F5F2]">
        <div>
          <h1 className="text-2xl font-bold">Privacy Policy</h1>
          <p className="text-sm text-[#53716C] dark:text-[#8FB0AA] mt-1">
            Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>

        <p className="text-sm">
          This policy explains what information AtriumDesk collects on behalf of {uniName} when you use
          this portal, why, and how it's handled. This is a general template and does not constitute legal
          advice — {uniName} is responsible for reviewing it against its own obligations before relying on it.
        </p>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">What we collect</h2>
          <ul className="list-disc pl-5 text-sm space-y-1">
            <li>Account information: name, university email, role (student/staff/admin).</li>
            <li>Academic profile you choose to provide: degree program, CGPA, semester, skills, study-abroad preferences — used to power scholarship and job matching.</li>
            <li>Support/issue tickets you submit, and their attachments.</li>
            <li>Chat messages with the AI assistant, including voice recordings you submit for transcription.</li>
            <li>Basic usage and login activity, for security and abuse prevention.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">How it's used</h2>
          <p className="text-sm">
            To answer your questions via the AI assistant, match you to relevant scholarships/jobs/events,
            route and resolve support tickets, and keep the portal secure. Chat questions are sent to a
            third-party AI provider (e.g. Groq or Google Gemini) to generate a response; message content is
            not used by AtriumDesk to train models.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Who can see it</h2>
          <p className="text-sm">
            Your own data is visible to you and to {uniName}'s authorized staff/administrators who need it to
            provide the service (e.g. resolving a ticket you filed). Data is stored in a database dedicated to
            {" " + uniName} and is not shared with other universities on this platform.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Your choices</h2>
          <p className="text-sm">
            You can update or remove most profile fields at any time from your Profile page. You can
            unsubscribe from email digests via the link in any digest email. To request full account
            deletion, contact your university's support office.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Contact</h2>
          <p className="text-sm">
            Questions about this policy can be directed to {uniName}'s support office, or to the address
            listed in your Settings page (if you are an administrator).
          </p>
        </section>

        <Link to="/" className="inline-block text-sm text-[#0D9488] dark:text-[#4E9128] hover:underline">
          ← Back
        </Link>
      </div>
    </div>
  );
};

export default Privacy;
