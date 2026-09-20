// SSRF validator unit tests (Rev 5 §9.6) — pure function, no mocking.
//
// Run with:  node --test server/test/urlSafety.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { isSafeUrl } from "../services/urlSafety.js";

test("allows a normal public https URL", () => {
  assert.equal(isSafeUrl("https://www.chevening.org/scholarship").safe, true);
});

test("allows a normal public http URL", () => {
  assert.equal(isSafeUrl("http://example.com/page").safe, true);
});

test("rejects a malformed URL", () => {
  assert.equal(isSafeUrl("not a url").safe, false);
});

test("rejects file:// protocol", () => {
  assert.equal(isSafeUrl("file:///etc/passwd").safe, false);
});

test("rejects ftp:// protocol", () => {
  assert.equal(isSafeUrl("ftp://example.com/file").safe, false);
});

test("rejects localhost by name", () => {
  assert.equal(isSafeUrl("http://localhost/admin").safe, false);
});

test("rejects the cloud metadata hostname", () => {
  assert.equal(isSafeUrl("http://metadata.google.internal/computeMetadata/v1/").safe, false);
});

test("rejects 127.0.0.1 (loopback)", () => {
  assert.equal(isSafeUrl("http://127.0.0.1/admin").safe, false);
});

test("rejects a 10.x.x.x private address", () => {
  assert.equal(isSafeUrl("http://10.0.0.5/internal").safe, false);
});

test("rejects a 172.16-31.x.x private address", () => {
  assert.equal(isSafeUrl("http://172.16.5.1/internal").safe, false);
  assert.equal(isSafeUrl("http://172.31.255.255/internal").safe, false);
});

test("does not falsely reject a public address that merely starts with 172", () => {
  // 172.64.0.0 is outside the 172.16.0.0/12 block (172.16-31.x.x) — a naive
  // string-prefix check on "172." would wrongly reject this.
  assert.equal(isSafeUrl("http://172.64.0.1/page").safe, true);
});

test("rejects a 192.168.x.x private address", () => {
  assert.equal(isSafeUrl("http://192.168.1.1/router").safe, false);
});

test("rejects a 169.254.x.x link-local address (cloud metadata range)", () => {
  assert.equal(isSafeUrl("http://169.254.169.254/latest/meta-data/").safe, false);
});

test("rejects 0.0.0.0", () => {
  assert.equal(isSafeUrl("http://0.0.0.0/").safe, false);
});

test("rejects IPv6 loopback ::1", () => {
  assert.equal(isSafeUrl("http://[::1]/admin").safe, false);
});

test("rejects a non-standard port", () => {
  assert.equal(isSafeUrl("http://example.com:8080/page").safe, false);
});

test("allows explicit default port 443 for https", () => {
  assert.equal(isSafeUrl("https://example.com:443/page").safe, true);
});

test("is a pure function: identical input always produces identical output", () => {
  const a = isSafeUrl("http://10.0.0.5/internal");
  const b = isSafeUrl("http://10.0.0.5/internal");
  assert.deepEqual(a, b);
});
