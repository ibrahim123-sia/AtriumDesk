// uploadKey() is the only thing standing between a stored URL and the R2
// bucket / local disk — a key outside uploads/ must never come out of it.
//
// Run with:  node --test server/test/fileStore.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { uploadKey } from "../services/fileStore.js";

test("stored URL and bare key map to the same key", () => {
  assert.equal(uploadKey("/uploads/avatars/a.png"), "uploads/avatars/a.png");
  assert.equal(uploadKey("uploads/issues/b.pdf"), "uploads/issues/b.pdf");
});

test("Windows separators are normalised", () => {
  assert.equal(uploadKey("uploads\\tenant-logos\\c.webp"), "uploads/tenant-logos/c.webp");
});

test("anything outside uploads/ is rejected", () => {
  assert.equal(uploadKey("/etc/passwd"), null);
  assert.equal(uploadKey("kb/chroma_db.tar.gz"), null);
  assert.equal(uploadKey("/uploads/../server.js"), null);
  assert.equal(uploadKey("uploads/../../etc/passwd"), null);
});

test("empty values are rejected", () => {
  assert.equal(uploadKey(""), null);
  assert.equal(uploadKey(null), null);
  assert.equal(uploadKey(undefined), null);
});
