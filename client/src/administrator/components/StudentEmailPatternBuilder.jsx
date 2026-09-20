import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { getPalette } from "../utils/palette";

// User request — the raw regex this field used to require
// ("(?<session>sp|fa)(?<year>...)...") is unreadable/unwriteable for a
// non-technical Administrator. This builds the exact same regex string the
// backend already expects (validateStudentEmailForTenant in
// userController.js) from four plain-language fields instead, with an
// "Advanced" escape hatch for patterns too exotic to represent this way —
// value/onChange keep the same raw-regex-string contract as a plain
// <input>, so this drops in wherever that input used to be.

const FIELD_DEFS = [
  { key: "session", label: "Session code", type: "codes", placeholder: "sp, fa" },
  { key: "year", label: "Year", type: "digits" },
  { key: "program", label: "Program code", type: "codes", placeholder: "bscs, bsai, bsse, bsbc" },
  { key: "roll", label: "Roll number", type: "digits" },
];

const EMPTY_FIELDS = {
  session: { enabled: false, codes: [] },
  year: { enabled: false, digits: 2 },
  program: { enabled: false, codes: [] },
  roll: { enabled: false, digits: 4 },
};

const SEPARATOR_OPTIONS = [
  { value: "", label: "None" },
  { value: "-", label: "Dash ( - )" },
  { value: "_", label: "Underscore ( _ )" },
  { value: ".", label: "Dot ( . )" },
];

// Codes go straight into a regex alternation — escape them so a stray
// regex-special character an admin types can never break the pattern or
// silently change what it matches.
const escapeRegexLiteral = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const compilePattern = (fields, separator) => {
  const parts = [];
  for (const def of FIELD_DEFS) {
    const f = fields[def.key];
    if (!f?.enabled) continue;
    if (def.type === "codes") {
      const codes = (f.codes || []).map((c) => c.trim().toLowerCase()).filter(Boolean).map(escapeRegexLiteral);
      if (codes.length === 0) continue;
      parts.push(`(?<${def.key}>${codes.join("|")})`);
    } else {
      const n = Math.min(Math.max(1, Number(f.digits) || 1), 10);
      parts.push(`(?<${def.key}>[0-9]{${n}})`);
    }
  }
  return parts.join(separator || "");
};

// Best-effort reverse of compilePattern. Only ever needs to round-trip a
// pattern THIS builder produced — anything else (a hand-written pattern
// with a numeric range like MAJU's real "2[0-6]" year, or an unrecognized
// named group) correctly fails parsedOk and falls back to the raw Advanced
// view instead of silently misrepresenting it.
const parsePattern = (pattern) => {
  const fields = JSON.parse(JSON.stringify(EMPTY_FIELDS));
  if (!pattern) return { fields, separator: "", parsedOk: true };

  const groupRegex = /\(\?<(\w+)>([^)]*)\)/g;
  let match;
  let lastEnd = 0;
  let separator = null;
  let ok = true;

  while ((match = groupRegex.exec(pattern))) {
    const [full, name, body] = match;
    if (!fields[name]) { ok = false; continue; }

    const between = pattern.slice(lastEnd, match.index);
    if (lastEnd > 0) {
      if (separator === null) separator = between;
      else if (between !== separator) ok = false;
    }
    lastEnd = match.index + full.length;

    const digitsMatch = body.match(/^\[0-9\]\{(\d+)\}$/) || body.match(/^\\d\{(\d+)\}$/);
    if (digitsMatch) {
      fields[name] = { enabled: true, digits: Number(digitsMatch[1]) };
    } else {
      const codes = body.split("|").map((s) => s.trim());
      if (codes.some((c) => !c || /[^a-z0-9]/i.test(c))) ok = false;
      fields[name] = { enabled: true, codes };
    }
  }
  if (lastEnd < pattern.length) ok = false;

  return { fields, separator: separator || "", parsedOk: ok };
};

const buildExample = (fields, separator) => {
  const parts = [];
  for (const def of FIELD_DEFS) {
    const f = fields[def.key];
    if (!f?.enabled) continue;
    if (def.type === "codes") {
      const first = (f.codes || []).map((c) => c.trim()).filter(Boolean)[0];
      if (!first) continue;
      parts.push(first);
    } else {
      const n = Math.min(Math.max(1, Number(f.digits) || 1), 10);
      parts.push("0".repeat(n - 1) + "1");
    }
  }
  return parts.length ? parts.join(separator || "") : "";
};

const StudentEmailPatternBuilder = ({ value, onChange }) => {
  const theme = useSelector((s) => s.theme.theme);
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const C = getPalette(theme === "dark", tenantBranding);

  const [advanced, setAdvanced] = useState(false);
  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [separator, setSeparator] = useState("");

  // Re-derive the friendly builder state whenever `value` changes from
  // OUTSIDE this component (e.g. switching to a different tenant) — but not
  // when it changes because WE just called onChange with our own compiled
  // output, which would be a wasted (though harmless) re-parse.
  useEffect(() => {
    if (value === compilePattern(fields, separator)) return;
    const parsed = parsePattern(value);
    if (!parsed.parsedOk) {
      setAdvanced(true);
      return;
    }
    setAdvanced(false);
    setFields(parsed.fields);
    setSeparator(parsed.separator);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emit = (nextFields, nextSeparator) => onChange(compilePattern(nextFields, nextSeparator));

  const toggleField = (key, enabled) => {
    const next = { ...fields, [key]: { ...fields[key], enabled } };
    setFields(next);
    emit(next, separator);
  };

  const updateCodes = (key, text) => {
    const next = { ...fields, [key]: { ...fields[key], codes: text.split(",").map((s) => s) } };
    setFields(next);
    emit(next, separator);
  };

  const updateDigits = (key, digits) => {
    const next = { ...fields, [key]: { ...fields[key], digits: Number(digits) } };
    setFields(next);
    emit(next, separator);
  };

  const updateSeparator = (sep) => {
    setSeparator(sep);
    emit(fields, sep);
  };

  const example = buildExample(fields, separator);
  const inputStyle = { backgroundColor: C.input, borderColor: C.border, color: C.text };

  if (advanced) {
    return (
      <div className="space-y-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="(?<session>sp|fa)(?<year>[0-9]{2})(?<program>bscs|bsai)(?<roll>[0-9]{4})"
          className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none font-mono text-xs"
          style={inputStyle}
        />
        <button
          type="button"
          onClick={() => setAdvanced(false)}
          className="text-xs underline"
          style={{ color: C.navy }}
        >
          Back to simple builder
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs" style={{ color: C.muted }}>
        Describe what a real student email looks like — no regex needed. Leave everything
        unchecked to accept any email format.
      </p>
      <div className="space-y-2">
        {FIELD_DEFS.map((def) => (
          <div key={def.key} className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm w-40 shrink-0" style={{ color: C.text }}>
              <input
                type="checkbox"
                checked={fields[def.key].enabled}
                onChange={(e) => toggleField(def.key, e.target.checked)}
              />
              {def.label}
            </label>
            {fields[def.key].enabled && (
              def.type === "codes" ? (
                <input
                  type="text"
                  value={(fields[def.key].codes || []).join(", ")}
                  onChange={(e) => updateCodes(def.key, e.target.value)}
                  placeholder={def.placeholder}
                  className="flex-1 px-3 py-1.5 text-sm rounded-lg border focus:outline-none"
                  style={inputStyle}
                />
              ) : (
                <select
                  value={fields[def.key].digits}
                  onChange={(e) => updateDigits(def.key, e.target.value)}
                  className="px-3 py-1.5 text-sm rounded-lg border focus:outline-none"
                  style={inputStyle}
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>{n} digit{n > 1 ? "s" : ""}</option>
                  ))}
                </select>
              )
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <label className="text-sm w-40 shrink-0" style={{ color: C.text }}>Separator between parts</label>
        <select
          value={separator}
          onChange={(e) => updateSeparator(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-lg border focus:outline-none"
          style={inputStyle}
        >
          {SEPARATOR_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
      {example && (
        <p className="text-xs" style={{ color: C.muted }}>
          Matches emails like: <span className="font-mono" style={{ color: C.text }}>{example}@yourdomain.edu</span>
        </p>
      )}
      <button type="button" onClick={() => setAdvanced(true)} className="text-xs underline" style={{ color: C.navy }}>
        Or write your own pattern (advanced)
      </button>
    </div>
  );
};

export default StudentEmailPatternBuilder;
