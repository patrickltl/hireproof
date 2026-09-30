/* =========================================================
   HireProof — license.js
   License key algorithm shared by the app and license-gen.html.
   Key = first 8 hex chars of FNV-1a 32-bit hash of
   (salt + normalized email), uppercased, split 4-4 (XXXX-XXXX).

   Pure functions only — no DOM, no storage. Safe to include
   on any page.
   ========================================================= */
(function () {
  "use strict";

  var SALT = "hireproof-salt-v1";

  /* Convert a JS string to an array of UTF-8 bytes. */
  function toUtf8Bytes(str) {
    var binary = unescape(encodeURIComponent(str));
    var bytes = [];
    for (var i = 0; i < binary.length; i++) {
      bytes.push(binary.charCodeAt(i) & 0xff);
    }
    return bytes;
  }

  /* FNV-1a, 32-bit. Returns an unsigned 32-bit integer. */
  function fnv1a32(str) {
    var hash = 0x811c9dc5;
    var bytes = toUtf8Bytes(str);
    for (var i = 0; i < bytes.length; i++) {
      hash ^= bytes[i];
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
  }

  /* Emails are normalized: trim + lowercase. */
  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  /* Email -> license key, e.g. "6F3A-91BC". */
  function makeKey(email) {
    var hash = fnv1a32(SALT + normalizeEmail(email));
    var hex = hash.toString(16).toUpperCase();
    while (hex.length < 8) { hex = "0" + hex; }
    return hex.slice(0, 4) + "-" + hex.slice(4, 8);
  }

  /* Verify an email + key pair. Tolerant of spaces, dashes,
     and letter case in the key. */
  function verifyKey(email, key) {
    var clean = String(key || "").replace(/[\s-]/g, "").toUpperCase();
    if (!normalizeEmail(email) || clean.length !== 8) { return false; }
    var expected = makeKey(email).replace("-", "");
    return clean === expected;
  }

  /* Basic email shape check used by both pages. */
  function looksLikeEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
  }

  window.HireProofLicense = {
    SALT: SALT,
    fnv1a32: fnv1a32,
    normalizeEmail: normalizeEmail,
    makeKey: makeKey,
    verifyKey: verifyKey,
    looksLikeEmail: looksLikeEmail
  };
})();
