// Rev7 SaaS follow-up — per-tenant SMTP app passwords are a real secret
// (equivalent to a customer's password: a DB leak would let an attacker send
// email as any university). Nothing in this codebase encrypted anything at
// rest before this; JWT_SECRET/INTERNAL_SECRET are server-level env vars,
// not per-tenant data. AES-256-GCM with a single symmetric key from env —
// proportionate for this project's scale, not a full KMS.
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // recommended for GCM

function getKey() {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "FIELD_ENCRYPTION_KEY is not configured — required to store/read encrypted tenant credentials (e.g. SMTP app passwords)."
    );
  }
  // Accepts a 64-char hex string (32 bytes) — generate one with:
  // node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  const key = Buffer.from(raw, "hex");
  if (key.length !== 32) {
    throw new Error("FIELD_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).");
  }
  return key;
}

export function encryptField(plaintext) {
  if (!plaintext) return "";
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // iv:authTag:ciphertext, all hex — self-contained, no separate IV storage needed.
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptField(ciphertext) {
  if (!ciphertext) return "";
  const key = getKey();
  const [ivHex, authTagHex, dataHex] = ciphertext.split(":");
  if (!ivHex || !authTagHex || !dataHex) {
    throw new Error("Malformed encrypted field value.");
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return decrypted.toString("utf8");
}
