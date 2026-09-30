/* =========================================================
   HireProof — app.js
   UI wiring: inputs, sample data, results rendering, score
   gauge, monetization gate, license modal, report export.

   Depends on (loaded before this file):
     js/config.js   -> SITE_CONFIG
     js/samples.js  -> HireProofSamples
     js/engine.js   -> HireProofEngine
     js/license.js  -> HireProofLicense
   ========================================================= */
(function () {
  "use strict";

  var STORAGE_UNLOCKED = "hp.unlocked";
  var STORAGE_DEMO = "hp.demoUntil";
  var DEMO_MS = 24 * 60 * 60 * 1000;

  var state = {
    result: null,
    planned: {},   /* display name -> true (chips the user marked "add this") */
    fixes: [],     /* [{ text, done }] */
    analyzed: false
  };

  /* ---------- tiny helpers ---------- */

  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $("toast");
    if (!el) { return; }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 4200);
  }

  /* ---------- licensing / gate ---------- */

  function isUnlocked() {
    try {
      var rec = JSON.parse(localStorage.getItem(STORAGE_UNLOCKED) || "null");
      if (rec && rec.email) { return true; }
    } catch (e) { /* corrupted record -> treat as locked */ }
    var demoUntil = Number(localStorage.getItem(STORAGE_DEMO) || 0);
    return demoUntil > Date.now();
  }

  function isDemoActive() {
    return Number(localStorage.getItem(STORAGE_DEMO) || 0) > Date.now();
  }

  function handleDemoParam() {
    try {
      var params = new URLSearchParams(window.location.search);
      if (params.get("demo") === "1") {
        localStorage.setItem(STORAGE_DEMO, String(Date.now() + DEMO_MS));
        toast("Demo mode active — full report unlocked for 24 hours.");
      }
    } catch (e) { /* older browser, no URLSearchParams */ }
  }

  function applyGate() {
    var unlocked = isUnlocked();
    var paid = $("paidArea");
    var overlay = $("lockOverlay");
    var licenseLink = $("enterKeyLink");
    if (!paid || !overlay) { return; }
    paid.classList.toggle("locked", !unlocked);
    overlay.classList.toggle("hidden", unlocked);
    if (licenseLink) { licenseLink.classList.toggle("hidden", unlocked); }
    /* Lock buttons inside paid area while gated (belt and braces vs. blur). */
    paid.querySelectorAll("button, input, a, details, summary").forEach(function (el) {
      el.tabIndex = unlocked ? "0" : "-1";
    });
    var demoBadge = $("demoBadge");
    if (demoBadge) { demoBadge.classList.toggle("hidden", !(unlocked && isDemoActive())); }
  }

  /* ---------- config application ---------- */

  function applyConfig() {
    document.querySelectorAll("[data-brand]").forEach(function (el) {
      el.textContent = SITE_CONFIG.brandName;
    });
    document.querySelectorAll("[data-price-report]").forEach(function (el) {
      el.textContent = SITE_CONFIG.priceReport;
    });
    document.querySelectorAll("[data-price-lifetime]").forEach(function (el) {
      el.textContent = SITE_CONFIG.priceLifetime;
    });
    var yr = $("footerYear");
    if (yr) { yr.textContent = String(new Date().getFullYear()); }
  }

  function paymentLink(kind) {
    return kind === "lifetime"
      ? SITE_CONFIG.stripePaymentLinkLifetime
      : SITE_CONFIG.stripePaymentLinkReport;
  }

  function openPayment(kind) {
    var link = paymentLink(kind);
    if (!link || link.indexOf("PASTE_YOUR") === 0) {
      toast("Payment link not configured yet. Site owner: paste your Stripe link into js/config.js.");
      return;
    }
    window.open(link, "_blank", "noopener");
  }

  /* ---------- inputs ---------- */

  function updateCounts() {
    var r = $("resumeInput"), j = $("jdInput");
    if (r && $("resumeCount")) { $("resumeCount").textContent = r.value.length.toLocaleString() + " characters"; }
    if (j && $("jdCount")) { $("jdCount").textContent = j.value.length.toLocaleString() + " characters"; }
    var btn = $("analyzeBtn");
    if (btn) {
      var ready = r.value.trim().length >= 60 && j.value.trim().length >= 60;
      btn.disabled = !ready;
    }
  }

  function loadSample() {
    $("resumeInput").value = HireProofSamples.resume;
    $("jdInput").value = HireProofSamples.jd;
    updateCounts();
    toast("Example resume and job description loaded. Hit \"Score my resume\".");
    $("resumeInput").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /* ---------- rendering ---------- */

  var CIRC = 2 * Math.PI * 84; /* gauge circle r=84 */

  function renderGauge(result) {
    var arc = $("gaugeArc");
    var num = $("gaugeNum");
    var bandEl = $("gaugeBandLabel");
    var svg = $("gaugeSvg");
    if (!arc || !num) { return; }

    ["band-red", "band-amber", "band-green"].forEach(function (c) { svg.classList.remove(c); });
    svg.classList.add("band-" + result.band);

    arc.style.strokeDasharray = String(CIRC);
    arc.style.strokeDashoffset = String(CIRC);
    /* Force a style flush, then animate to the target. */
    void arc.getBoundingClientRect();
    requestAnimationFrame(function () {
      arc.style.strokeDashoffset = String(CIRC * (1 - result.score / 100));
    });

    var start = performance.now();
    var dur = 1100;
    function tick(now) {
      var p = Math.min(1, (now - start) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      num.textContent = String(Math.round(result.score * eased));
      if (p < 1) { requestAnimationFrame(tick); }
    }
    requestAnimationFrame(tick);

    if (bandEl) {
      bandEl.textContent = result.band === "green" ? "Strong match" : result.band === "amber" ? "Decent match — worth fixing" : "Weak match — fixable";
    }
  }

  function statusPill(status) {
    var map = { pass: ["PASS", "pill-pass"], warn: ["FIX", "pill-warn"], fail: ["FAIL", "pill-fail"] };
    var m = map[status] || map.warn;
    return '<span class="pill ' + m[1] + '">' + m[0] + "</span>";
  }

  function checkRowHtml(c) {
    return (
      '<li class="check-row">' +
        statusPill(c.status) +
        '<div><strong>' + escapeHtml(c.label) + "</strong>" +
        '<p class="muted">' + escapeHtml(c.detail) + "</p></div>" +
      "</li>"
    );
  }

  function chipHtml(k) {
    var planned = !!state.planned[k.display];
    return (
      '<span class="chip' + (planned ? " planned" : "") + '" data-chip="' + escapeHtml(k.display) + '">' +
        escapeHtml(k.display) +
        (k.must ? '<em class="chip-tag">must</em>' : "") +
        '<button type="button" class="chip-add" title="' + (planned ? "Remove from suggested skills" : "I have this — add it to the suggested skills block") + '" aria-label="Toggle ' + escapeHtml(k.display) + '">' + (planned ? "&#10003;" : "+") + "</button>" +
      "</span>"
    );
  }

  function keywordTableHtml(list, emptyNote) {
    if (!list.length) { return '<p class="muted">' + escapeHtml(emptyNote) + "</p>"; }
    var rows = list.slice(0, 25).map(function (k) {
      return (
        "<tr>" +
          "<td>" + escapeHtml(k.display) + "</td>" +
          "<td>" + (k.must ? "Must-have" : "Nice-to-have") + "</td>" +
          '<td>' + (k.present ? '<span class="pill pill-pass">FOUND</span>' : '<span class="pill pill-fail">MISSING</span>') + "</td>" +
          "<td class=\"muted\">" + (k.present
            ? "In your resume" + (k.exactInResume ? "" : " (as a close variant)")
            : (k.plausibleVariant ? "You likely have a variant — see skills suggestion" : "Add if you genuinely have it")) + "</td>" +
        "</tr>"
      );
    }).join("");
    return (
      '<table class="table"><thead><tr><th>Keyword</th><th>Type</th><th>Status</th><th>What to do</th></tr></thead>' +
      "<tbody>" + rows + "</tbody></table>"
    );
  }

  function computeSkillList() {
    if (!state.result) { return []; }
    var seen = {};
    var list = [];
    function push(d) {
      if (!seen[d]) { seen[d] = true; list.push(d); }
    }
    /* 1. Chips the user explicitly claimed */
    state.result.missing.forEach(function (k) { if (state.planned[k.display]) { push(k.display); } });
    /* 2. Missing keywords the resume plausibly covers in variant form */
    state.result.missing.forEach(function (k) { if (!state.planned[k.display] && k.plausibleVariant) { push(k.display); } });
    /* 3. Strongest keywords already present, to round out the block */
    state.result.must.concat(state.result.nice).forEach(function (k) { if (k.present) { push(k.display); } });
    return list.slice(0, 12);
  }

  function renderSkills() {
    var box = $("skillsBlock");
    if (!box || !state.result) { return; }
    var skills = computeSkillList();
    if (!skills.length) {
      box.innerHTML = '<p class="muted">Nothing to suggest yet.</p>';
      return;
    }
    box.innerHTML =
      '<pre class="skills-pre" id="skillsPre">' + escapeHtml(HireProofEngine.formatSkillsBlock(skills)) + "</pre>" +
      '<div class="skills-actions">' +
        '<button type="button" class="btn btn-ghost btn-sm" id="copySkillsBtn">Copy skills block</button>' +
      "</div>" +
      '<p class="fine muted">Only claim skills you actually have. Keywords marked as "likely variant" were inferred from similar wording in your resume — verify each one before sending.</p>';
    var copyBtn = $("copySkillsBtn");
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        copyText(HireProofEngine.formatSkillsBlock(computeSkillList()), "Skills block copied to clipboard.");
      });
    }
  }

  function buildFixList() {
    var fixes = [];
    if (!state.result) { return fixes; }
    var r = state.result;
    var topMissing = r.missing.filter(function (k) { return k.must; }).slice(0, 6);
    topMissing.forEach(function (k) {
      fixes.push({
        text: 'Add "' + k.display + '" if you genuinely have this experience — weave it into a bullet with an outcome, not just a list.',
        done: false
      });
    });
    var secondBatch = r.missing.filter(function (k) { return !k.must && k.plausibleVariant; }).slice(0, 3);
    secondBatch.forEach(function (k) {
      fixes.push({
        text: 'Align wording: your resume suggests "' + k.display + '" in a variant form. Use the exact phrasing from the job post.',
        done: false
      });
    });
    r.checks.forEach(function (c) {
      if (c.status !== "pass") {
        fixes.push({ text: "Format fix — " + c.label + ": " + c.detail, done: false });
      }
    });
    return fixes;
  }

  function renderFixList() {
    var el = $("fixList");
    if (!el) { return; }
    if (!state.fixes.length) {
      el.innerHTML = '<p class="muted">No fixes needed — outstanding. Re-run against another job description to keep tuning.</p>';
      return;
    }
    el.innerHTML = state.fixes.map(function (f, i) {
      return (
        '<li class="fix-item">' +
          '<label><input type="checkbox" data-fix="' + i + '"' + (f.done ? " checked" : "") + "> " +
          "<span>" + escapeHtml(f.text) + "</span></label>" +
        "</li>"
      );
    }).join("");
    el.querySelectorAll("input[data-fix]").forEach(function (input) {
      input.addEventListener("change", function () {
        state.fixes[Number(input.getAttribute("data-fix"))].done = input.checked;
      });
    });
  }

  function renderPaid() {
    if (!state.result) { return; }
    var r = state.result;

    $("missingChips").innerHTML = r.missing.length
      ? r.missing.slice(0, 14).map(chipHtml).join("")
      : '<p class="muted">No important keywords are missing. Nice work.</p>';

    $("missingChips").querySelectorAll(".chip-add").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var chipEl = btn.closest(".chip");
        var display = chipEl.getAttribute("data-chip");
        if (state.planned[display]) { delete state.planned[display]; }
        else {
          state.planned[display] = true;
          toast('Marked "' + display + '" as a skill you have — added to the suggested skills block.');
        }
        renderPaid();
      });
    });

    $("mustTable").innerHTML = keywordTableHtml(r.must, "No must-have keywords detected in this job description.");
    $("niceTable").innerHTML = keywordTableHtml(r.nice, "No nice-to-have keywords detected in this job description.");

    $("allChecks").innerHTML = r.checks.map(checkRowHtml).join("");
    $("freeChecks").innerHTML = r.checks.slice(0, 3).map(checkRowHtml).join("");

    state.fixes = buildFixList();
    renderFixList();
    renderSkills();

    applyGate();
  }

  function renderResults(result) {
    state.result = result;
    state.planned = {};
    state.analyzed = true;
    $("resultsSection").classList.remove("hidden");
    $("resultsPlaceholder").classList.add("hidden");
    renderGauge(result);
    renderPaid();
    $("resultsSection").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------- analysis ---------- */

  function analyze() {
    var resume = $("resumeInput").value;
    var jd = $("jdInput").value;
    var errEl = $("formError");
    errEl.classList.add("hidden");

    if (resume.trim().length < 60 || jd.trim().length < 60) {
      errEl.textContent = "Paste both your resume text and the job description (at least a few lines each) to get a score.";
      errEl.classList.remove("hidden");
      return;
    }

    var result = HireProofEngine.analyze(resume, jd);
    if (!result) {
      errEl.textContent = "We couldn't extract meaningful keywords from that job description. Try pasting the full posting, including the requirements section.";
      errEl.classList.remove("hidden");
      return;
    }
    renderResults(result);
  }

  /* ---------- report export ---------- */

  function reportLines() {
    var r = state.result;
    var L = [];
    var now = new Date();
    L.push("HIREPROOF — ATS MATCH REPORT");
    L.push("Generated: " + now.toISOString().slice(0, 16).replace("T", " ") + " UTC");
    L.push("Target role: " + r.jdTitle);
    L.push("Match score: " + r.score + "/100 (" + (r.band === "green" ? "Strong" : r.band === "amber" ? "Decent" : "Weak") + ")");
    L.push("");
    L.push("HOW TO READ THIS: the score is weighted keyword coverage — 70% must-have, 30% nice-to-have.");

    L.push("");
    L.push("MUST-HAVE KEYWORDS");
    r.must.forEach(function (k) {
      L.push((k.present ? "[x] " : "[ ] ") + k.display + (k.present ? " — found" : " — MISSING"));
    });
    L.push("");
    L.push("NICE-TO-HAVE KEYWORDS");
    r.nice.forEach(function (k) {
      L.push((k.present ? "[x] " : "[ ] ") + k.display + (k.present ? " — found" : " — missing"));
    });

    L.push("");
    L.push("ATS FORMAT CHECKS");
    r.checks.forEach(function (c) {
      L.push((c.status === "pass" ? "PASS" : c.status === "warn" ? "FIX " : "FAIL") + " — " + c.label);
      L.push("      " + c.detail);
    });

    L.push("");
    L.push("PRIORITIZED FIX LIST");
    state.fixes.forEach(function (f, i) {
      L.push((i + 1) + ". [" + (f.done ? "x" : " ") + "] " + f.text);
    });

    L.push("");
    L.push(HireProofEngine.formatSkillsBlock(computeSkillList()));

    L.push("");
    L.push("Privacy note: this report was generated entirely in your browser. Your resume was never uploaded.");
    L.push("HireProof is an educational tool. No tool can guarantee interviews or hiring outcomes.");
    L.push("Not affiliated with or endorsed by any ATS vendor.");
    return L.join("\n");
  }

  function copyText(text, okMsg) {
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); toast(okMsg); }
      catch (e) { toast("Copy failed — select the text and copy manually."); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fallback);
    } else {
      fallback();
    }
  }

  function downloadReport() {
    var r = state.result;
    if (!r) { return; }
    var esc = escapeHtml;
    var rows = r.must.concat(r.nice).map(function (k) {
      return "<tr><td>" + esc(k.display) + "</td><td>" + (k.must ? "Must-have" : "Nice-to-have") + "</td><td>" +
        (k.present ? '<span class="ok">Found</span>' : '<span class="miss">Missing</span>') + "</td></tr>";
    }).join("");
    var checks = r.checks.map(function (c) {
      return '<li><strong>' + esc(c.label) + "</strong> — " + esc(c.detail) + "</li>";
    }).join("");
    var fixes = state.fixes.map(function (f) {
      return '<li><strong>[ ' + (f.done ? "x" : " ") + ' ]</strong> ' + esc(f.text) + "</li>";
    }).join("");

    var html = (
      '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>' + esc(SITE_CONFIG.brandName) + ' ATS Report</title>' +
      '<style>body{font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;color:#0F172A;line-height:1.55}' +
      'h1,h2{color:#0F172A}h2{border-bottom:2px solid #E2E8F0;padding-bottom:6px;margin-top:36px}' +
      'table{border-collapse:collapse;width:100%}td,th{border:1px solid #E2E8F0;padding:8px 10px;text-align:left;font-size:14px}' +
      '.ok{color:#059669;font-weight:600}.miss{color:#DC2626;font-weight:600}' +
      '.score{font-size:44px;font-weight:800;color:#4F46E5}.muted{color:#64748B;font-size:13px}' +
      '.note{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:12px 16px;font-size:13px;color:#334155}</style></head><body>' +
      "<h1>" + esc(SITE_CONFIG.brandName) + " — ATS Match Report</h1>" +
      '<p class="muted">Generated ' + new Date().toLocaleString() + " · Target role: " + esc(r.jdTitle) + "</p>" +
      '<p class="score">' + r.score + '<span style="font-size:18px;color:#64748B">/100</span></p>' +
      '<p>Weighted keyword coverage: 70% must-have, 30% nice-to-have. Band: <strong>' + r.band.toUpperCase() + "</strong>.</p>" +
      "<h2>Keywords</h2><table><tr><th>Keyword</th><th>Type</th><th>Status</th></tr>" + rows + "</table>" +
      "<h2>ATS format checks</h2><ul>" + checks + "</ul>" +
      "<h2>Prioritized fix list</h2><ul>" + fixes + "</ul>" +
      "<h2>Suggested core skills block</h2><pre>" + esc(HireProofEngine.formatSkillsBlock(computeSkillList())) + "</pre>" +
      '<div class="note"><strong>Honest notes.</strong> Generated locally in your browser — nothing was uploaded. ' + esc(SITE_CONFIG.brandName) +
      " is an educational tool; no tool can guarantee interviews or hiring outcomes. Not affiliated with or endorsed by any ATS vendor.</div>" +
      "</body></html>"
    );

    var blob = new Blob([html], { type: "text/html;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "hireproof-ats-report.html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    toast("Report downloaded.");
  }

  /* ---------- license modal ---------- */

  function openModal() {
    $("licenseModal").classList.remove("hidden");
    $("licenseError").classList.add("hidden");
    $("licenseKey").value = "";
    setTimeout(function () { $("licenseEmail").focus(); }, 40);
  }

  function closeModal() {
    $("licenseModal").classList.add("hidden");
  }

  function validateLicense() {
    var email = $("licenseEmail").value;
    var key = $("licenseKey").value;
    var errEl = $("licenseError");
    errEl.classList.add("hidden");

    if (!HireProofLicense.looksLikeEmail(email)) {
      errEl.textContent = "Enter the email address you used at checkout.";
      errEl.classList.remove("hidden");
      return;
    }
    if (!HireProofLicense.verifyKey(email, key)) {
      errEl.textContent = "That key doesn't match this email. Keys look like 4A2B-9C1D — copy it exactly as it arrived, then try again.";
      errEl.classList.remove("hidden");
      return;
    }
    localStorage.setItem(STORAGE_UNLOCKED, JSON.stringify({
      email: HireProofLicense.normalizeEmail(email),
      ts: Date.now()
    }));
    closeModal();
    applyGate();
    toast("License verified — full report unlocked. Thank you for paying once.");
  }

  /* ---------- init ---------- */

  function init() {
    applyConfig();
    handleDemoParam();

    $("resumeInput").addEventListener("input", updateCounts);
    $("jdInput").addEventListener("input", updateCounts);
    $("sampleBtn").addEventListener("click", loadSample);
    $("analyzeBtn").addEventListener("click", analyze);
    updateCounts();

    document.querySelectorAll("[data-payment]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openPayment(btn.getAttribute("data-payment"));
      });
    });

    $("copyReportBtn").addEventListener("click", function () {
      if (!state.result) { return; }
      copyText(reportLines(), "Report copied to clipboard as plain text.");
    });
    $("downloadReportBtn").addEventListener("click", downloadReport);

    $("openModalBtn").addEventListener("click", openModal);
    $("openModalBtn2").addEventListener("click", openModal);
    $("enterKeyLink").addEventListener("click", openModal);
    $("modalClose").addEventListener("click", closeModal);
    $("modalCancel").addEventListener("click", closeModal);
    $("validateBtn").addEventListener("click", validateLicense);
    $("licenseModal").addEventListener("click", function (e) {
      if (e.target === $("licenseModal")) { closeModal(); }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { closeModal(); }
    });
    $("licenseKey").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { validateLicense(); }
    });

    applyGate();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
