import fs from "fs";
import path from "path";
import { AwsClient } from "aws4fetch";

// Uploaded files (issue attachments, avatars, tenant logos, activity images)
// live on local disk under uploads/. When R2 is configured each one is also
// copied to the bucket under the same key ("uploads/issues/<file>"), because
// a Cloudflare container's disk is wiped whenever it sleeps or is
// redeployed. The Cloudflare Worker (cloudflare/src/index.js) serves
// /uploads/* straight from the bucket; serveUploadFromRemote below covers
// anything that still reaches this server.
//
// Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
// (R2_ENDPOINT instead of R2_ACCOUNT_ID for another S3-compatible store).
// Without them everything stays local-only, exactly as in development.

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
const R2_ENDPOINT = (
  process.env.R2_ENDPOINT || (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : "")
).replace(/\/+$/, "");

export const remoteStorageEnabled = Boolean(R2_ENDPOINT && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET);

const r2 = remoteStorageEnabled
  ? new AwsClient({
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      service: "s3",
      region: "auto",
    })
  : null;

const objectUrl = (key) => `${R2_ENDPOINT}/${R2_BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`;

// "/uploads/issues/x.pdf" or "uploads/issues/x.pdf" → "uploads/issues/x.pdf".
// Anything outside uploads/ → null, so a bad value can never reach other
// keys in the bucket (or other files on disk).
export const uploadKey = (urlOrKey) => {
  if (!urlOrKey) return null;
  const normalized = path.posix.normalize(String(urlOrKey).replace(/\\/g, "/").replace(/^\/+/, ""));
  return normalized.startsWith("uploads/") && !normalized.split("/").includes("..") ? normalized : null;
};

// Copy a file multer just wrote to the bucket. Resolves immediately when R2
// isn't configured.
export async function putUpload(filePath, key, contentType) {
  if (!r2) return;
  const safeKey = uploadKey(key);
  if (!safeKey) throw new Error("Upload key outside uploads/");
  const body = await fs.promises.readFile(filePath);
  const res = await r2.fetch(objectUrl(safeKey), {
    method: "PUT",
    body,
    headers: { "Content-Type": contentType || "application/octet-stream" },
  });
  if (!res.ok) throw new Error(`Storing the file failed (R2 ${res.status})`);
}

// Best-effort delete of an upload, on disk and in the bucket. `urlOrKey` is
// the stored URL ("/uploads/avatars/x.png") or key; `localPath` defaults to
// that key under the working directory. Never throws.
export function deleteUpload(urlOrKey, localPath) {
  const key = uploadKey(urlOrKey);
  const diskPath = localPath || (key ? path.join(process.cwd(), key) : null);
  if (diskPath) fs.unlink(diskPath, () => {}); // ignore ENOENT
  if (r2 && key) {
    r2.fetch(objectUrl(key), { method: "DELETE" })
      .then((res) => {
        if (!res.ok && res.status !== 404) console.error(`R2 delete failed for ${key}: ${res.status}`);
      })
      .catch((error) => console.error(`R2 delete failed for ${key}:`, error.message));
  }
}

// Express handler after express.static: a file missing on this (fresh)
// container disk is streamed from the bucket instead of a 404.
export async function serveUploadFromRemote(req, res, next) {
  if (!r2 || (req.method !== "GET" && req.method !== "HEAD")) return next();
  const key = uploadKey(`uploads${req.path}`);
  if (!key) return next();
  try {
    const remote = await r2.fetch(objectUrl(key), { method: req.method });
    if (!remote.ok) return next();
    res.set("Content-Type", remote.headers.get("content-type") || "application/octet-stream");
    const length = remote.headers.get("content-length");
    if (length) res.set("Content-Length", length);
    res.set("Cache-Control", "public, max-age=86400");
    res.set("X-Content-Type-Options", "nosniff");
    if (req.method === "HEAD") return res.end();
    res.end(Buffer.from(await remote.arrayBuffer()));
  } catch (error) {
    console.error(`R2 read failed for ${key}:`, error.message);
    next();
  }
}
