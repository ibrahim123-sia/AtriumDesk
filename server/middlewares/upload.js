import multer from "multer";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";

const ISSUE_UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads/issues";
const AVATAR_UPLOAD_DIR = "uploads/avatars";
const TENANT_LOGO_UPLOAD_DIR = "uploads/tenant-logos";
const ACTIVITY_IMAGE_UPLOAD_DIR = "uploads/activity-images";

for (const dir of [ISSUE_UPLOAD_DIR, AVATAR_UPLOAD_DIR, TENANT_LOGO_UPLOAD_DIR, ACTIVITY_IMAGE_UPLOAD_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// The on-disk extension must come from the VERIFIED mimetype, never from
// the client-supplied `originalname` — those are two independent
// attacker-controlled multipart fields (Content-Type header vs. filename),
// so trusting originalname's extension lets a request with, say,
// Content-Type: image/png and originalname: "x.html" pass the mimetype
// filter below but save as "&lt;uuid&gt;.html", which express.static then serves
// as text/html — a stored same-origin XSS vector. Only mimetypes with a
// mapped extension here are ever accepted (see fileFilter/avatarFilter).
const MIME_TO_EXT = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, ISSUE_UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, `${uuidv4()}${MIME_TO_EXT[file.mimetype] || ""}`);
  },
});

const ALLOWED_MIME = new Set(Object.keys(MIME_TO_EXT));

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed: ${file.mimetype}. Only PDF and images.`), false);
  }
};

export const issueUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 3,
  },
});

// ---------------------------------------------------------------------------
// Avatar upload — separate config so we can enforce images-only and a smaller
// size limit independently from issue attachments.
// ---------------------------------------------------------------------------

const AVATAR_ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, AVATAR_UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, `${uuidv4()}${MIME_TO_EXT[file.mimetype] || ""}`);
  },
});

// Explicit allow-list, not a `startsWith("image/")` check — that would also
// pass "image/svg+xml", and an SVG can embed a <script> tag (a different
// flavor of the same stored-XSS risk the extension fix above addresses).
const avatarFilter = (req, file, cb) => {
  if (AVATAR_ALLOWED_MIME.has(file.mimetype)) cb(null, true);
  else cb(new Error("Profile picture must be an image (JPG, PNG, WebP, etc.)"), false);
};

export const avatarUpload = multer({
  storage: avatarStorage,
  fileFilter: avatarFilter,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB cap
    files: 1,
  },
});

// ---------------------------------------------------------------------------
// Tenant logo upload (Rev7 §6/T2 — "option for logo and for theme of that
// university" at tenant-creation time) — same shape as avatarUpload.
// ---------------------------------------------------------------------------

const tenantLogoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, TENANT_LOGO_UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, `${uuidv4()}${MIME_TO_EXT[file.mimetype] || ""}`);
  },
});

export const tenantLogoUpload = multer({
  storage: tenantLogoStorage,
  fileFilter: avatarFilter,
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 1,
  },
});

// ---------------------------------------------------------------------------
// Activity tab image upload (guest-facing Activity pages, admin-authored) —
// same images-only filter as avatars/logos, one file per request (the admin
// UI inserts each upload's returned URL into a section, so multiple images
// on one tab are multiple separate upload calls, not a single multi-file one).
// ---------------------------------------------------------------------------

const activityImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, ACTIVITY_IMAGE_UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, `${uuidv4()}${MIME_TO_EXT[file.mimetype] || ""}`);
  },
});

export const activityImageUpload = multer({
  storage: activityImageStorage,
  fileFilter: avatarFilter,
  limits: {
    fileSize: 3 * 1024 * 1024, // 3MB cap — page images, not print-quality assets
    files: 1,
  },
});

// ---------------------------------------------------------------------------
// CV upload — memory storage, not disk. The file is forwarded to Python for
// parsing and never written anywhere (Rev 5 §5.3: "Delete the raw CV file
// after parsing" — using memoryStorage means there is no disk file to ever
// forget to delete; the Buffer is garbage-collected once the request ends).
// ---------------------------------------------------------------------------

const CV_ALLOWED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
]);

const cvFilter = (req, file, cb) => {
  if (CV_ALLOWED_MIME.has(file.mimetype)) cb(null, true);
  else cb(new Error("CV must be a PDF or DOCX file"), false);
};

export const cvUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: cvFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB cap
    files: 1,
  },
});

// ---------------------------------------------------------------------------
// Student CSV import — memory storage, same reasoning as cvUpload: the file
// is parsed in-memory and never persisted (nothing here needs a disk copy).
// ---------------------------------------------------------------------------

const csvFilter = (req, file, cb) => {
  if (file.mimetype === "text/csv" || file.originalname.toLowerCase().endsWith(".csv")) cb(null, true);
  else cb(new Error("File must be a .csv file"), false);
};

export const csvUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: csvFilter,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB cap — plenty for a few thousand rows of plain text
    files: 1,
  },
});

export const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ success: false, message: "File too large (max 5MB per file)" });
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({ success: false, message: "Too many files (max 3)" });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next();
};
