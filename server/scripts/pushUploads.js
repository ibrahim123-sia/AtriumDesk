// One-time copy of the local uploads/ folder (avatars, tenant logos, issue
// attachments, activity images) to R2, for a Cloudflare deploy whose
// database already points at these files — the container starts on an
// empty disk, and the Worker serves /uploads/* from the bucket. Keys match
// the stored URLs ("/uploads/avatars/x.png" → "uploads/avatars/x.png").
// Safe to re-run (files are overwritten with the same bytes).
//
// Needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
// (server/.env or the environment). Run from server/: node scripts/pushUploads.js
import "dotenv/config";
import fs from "fs";
import path from "path";
import { putUpload, remoteStorageEnabled } from "../services/fileStore.js";

const CONTENT_TYPES = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });

if (!remoteStorageEnabled) {
  console.error("❌ R2 is not configured: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET.");
  process.exit(1);
}
if (!fs.existsSync("uploads")) {
  console.log("No uploads/ folder here — nothing to copy.");
  process.exit(0);
}

let copied = 0;
let failed = 0;
for (const file of walk("uploads")) {
  const key = path.relative(process.cwd(), file).replace(/\\/g, "/");
  const contentType = CONTENT_TYPES[path.extname(file).toLowerCase()];
  if (!contentType) {
    console.log(`skip  ${key} (not an upload type)`);
    continue;
  }
  try {
    await putUpload(file, key, contentType);
    console.log(`ok    ${key}`);
    copied += 1;
  } catch (error) {
    console.error(`FAIL  ${key}: ${error.message}`);
    failed += 1;
  }
}

console.log(`\n${copied} file(s) copied to R2${failed ? `, ${failed} failed` : ""}.`);
process.exit(failed ? 1 : 0);
