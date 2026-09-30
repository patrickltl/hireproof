/* =========================================================
   HireProof — engine.js
   The scoring engine. Pure functions, no DOM access, no
   network calls. Exposed as window.HireProofEngine.

   Pipeline:
   1. Tokenize (lowercase, keep skill-ish punctuation like + # . / -)
   2. Remove stopwords, light stemming (-ing / -ed / -es / -s)
   3. Parse the job description into sections; terms in the
      job title and Requirements / Must-have sections are
      weighted higher and treated as must-haves.
   4. Extract uni- and bi-gram keywords, frequency-ranked.
   5. Match keywords against the resume using stems.
   6. Score = 0.7 * must-have coverage + 0.3 * nice-to-have coverage.
   7. Run ATS format checks on the resume text.
   8. Find "plausible variant" keywords (e.g. resume says
      "managing", JD says "management") for the skills
      generator.
   ========================================================= */
(function () {
  "use strict";

  /* ---------- vocabularies ---------- */

  var STOPWORD_LIST = (
    "a,an,the,and,or,but,if,then,else,when,while,for,to,of,in,on,at,by,with,from,as,is,are,was,were,be,been,being," +
    "it,its,this,that,these,those,you,your,yours,we,our,ours,they,their,them,he,him,his,she,her,i,me,my,mine,myself," +
    "will,would,can,could,should,shall,may,might,must,do,does,did,done,doing,have,has,had,having," +
    "not,no,nor,so,than,too,very,just,also,about,into,over,under,again,further,once,here,there,where,why,how," +
    "all,any,both,each,few,more,most,other,others,some,such,only,own,same,who,whom,which,what,whose," +
    "during,before,after,above,below,up,down,out,off,between,through,per,via,etc,eg,ie,across,within,along," +
    "am,be,being,get,gets,getting,got,like,unlike,okay,ok,please,you'll,we're,we'll,we've,they're,don't,doesn't,us,eu,uk,na,emea,apac"
  ).split(",");

  /* Words so generic in job ads that listing them as "missing
     keywords" would be noise, not signal. */
  var GENERIC_LIST = (
    "experience,experiences,experienced,years,year,team,teams,role,roles,position,positions,company,companies," +
    "candidate,candidates,ability,abilities,able,skill,skills,skilled,talent,talented,strong,stronger,strongest," +
    "excellent,exceptional,outstanding,good,great,plus,required,require,requires,requirement,requirements," +
    "preferred,prefer,joins,joining,join,benefit,benefits,salary,compensation,equity,opportunity,opportunities," +
    "environment,environments,business,businesses,customer,customers,client,clients,people,person,someone,anyone," +
    "everyone,ideal,day,days,time,times,full,part,new,nice,including,include,includes,included,using,use,used,uses," +
    "knowledge,understanding,understand,degree,field,fields,related,well,best,better,level,levels,high,highly," +
    "minimum,least,proven,deep,solid,relevant,work,working,works,worked,job,jobs,career,remote,onsite,hybrid," +
    "full-time,part-time,contract,temporary,permanent,looking,apply,application,applicant,resume,cvs," +
    "things,stuff,area,areas,side,things,helps,helping,help,day-to-day,everyday,daily,weekly,monthly," +
    "title,titles,opening,openings,location,locations,professional,modern,real,comfortable,tools,tool,based,git-based"
  ).split(",");

  var STOPWORDS = {};
  var GENERIC = {};
  STOPWORD_LIST.forEach(function (w) { STOPWORDS[w] = true; });
  GENERIC_LIST.forEach(function (w) { GENERIC[w] = true; });

  /* ---------- tokenization + stemming ---------- */

  function tokenize(text) {
    var raw = String(text || "").toLowerCase().match(/[a-z][a-z0-9+#./-]*/g) || [];
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var t = raw[i].replace(/[.\-/]+$/, "");
      if (t.length >= 2 && t.length <= 40 && t.indexOf("...") === -1) {
        out.push(t);
      }
    }
    return out;
  }

  /* Light stemming: enough that managed / manages / managing
     collapse to the same stem. Not a real linguistics stemmer. */
  function stem(word) {
    var w = word;
    if (w.length > 5 && /ing$/.test(w)) { return w.slice(0, -3); }
    if (w.length > 4 && /ed$/.test(w)) { return w.slice(0, -2); }
    if (w.length > 4 && /es$/.test(w)) { return w.slice(0, -2); }
    if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w) && !/us$/.test(w)) { return w.slice(0, -1); }
    return w;
  }

  function isContentWord(t) {
    if (STOPWORDS[t] || GENERIC[t] || /^\d+$/.test(t)) { return false; }
    /* Drop slash-compounds made entirely of filler ("us/eu", "and/or")
       while keeping real ones ("ci/cd"). */
    if (t.indexOf("/") !== -1) {
      var parts = t.split("/");
      var allFiller = true;
      for (var i = 0; i < parts.length; i++) {
        if (!STOPWORDS[parts[i]] && !GENERIC[parts[i]]) { allFiller = false; break; }
      }
      if (allFiller) { return false; }
    }
    return true;
  }

  /* ---------- job description parsing ---------- */

  var SECTION_HEADERS = [
    { kind: "title", re: /^(job\s*title|position|role|title|opening)\s*[:\-–—]/ },
    { kind: "req", re: /^(requirements|required\s+qualifications|qualifications|must[-\s]?haves?|key\s+requirements|minimum\s+qualifications|what\s+you.?ll\s+need|about\s+you|who\s+you\s+are|who\s+we.?re\s+looking\s+for|what\s+we.?re\s+looking\s+for|skills\s+(?:and|&)\s+(?:experience|qualifications)|your\s+profile|candidate\s+profile|essential\s+(?:skills|requirements|experience))\s*[:\-–—]?$/ },
    { kind: "nice", re: /^(nice\s+to\s+have|preferred\s+qualifications|preferred|bonus\s+points?|good\s+to\s+have|desirable|pluses?|plus(es)?|bonus)\s*[:\-–—]?$/ },
    { kind: "body", re: /^(responsibilities|what\s+you.?ll\s+do|duties|key\s+responsibilities|your\s+responsibilities|day\s+to\s+day|the\s+role|about\s+the\s+role|about\s+us|about\s+the\s+company|our\s+team|benefits|perks|why\s+join(\s+us)?|salary|compensation|how\s+to\s+apply|equal\s+opportunity|overview|company\s+overview)\s*[:\-–—]?$/ }
  ];

  function detectSection(line) {
    var low = line.toLowerCase().replace(/\s+/g, " ").trim();
    for (var i = 0; i < SECTION_HEADERS.length; i++) {
      if (SECTION_HEADERS[i].re.test(low)) { return SECTION_HEADERS[i].kind; }
    }
    return null;
  }

  function parseJD(text) {
    var sections = { title: [], req: [], nice: [], body: [] };
    var current = "body";
    var lines = String(text || "").split(/\r?\n/);

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) { continue; }
      var kind = detectSection(line);
      if (kind === "title") {
        /* Inline form: "Job Title: Senior Frontend Engineer" — the text
           after the delimiter IS the title; consume it here. */
        var m = line.match(/^(?:job\s*title|position|role|title|opening)\s*[:\-–—]\s*(.+)$/i);
        if (m && m[1].trim()) {
          sections.title.push(m[1].trim());
          current = "body";
        } else {
          current = "title";
        }
        continue;
      }
      if (kind) {
        current = kind;
        continue;
      }
      /* A short line ending in ":" (e.g. "Our ideal candidate:") is a
         header for the current section, not keyword content. */
      if (line.length <= 60 && /:$/.test(line)) { continue; }
      /* A title section only ever holds its first line — anything
         after it is regular content. */
      if (current === "title" && sections.title.length >= 1) {
        sections.body.push(line);
        continue;
      }
      sections[current].push(line);
    }

    /* Fallback: if no explicit title line, treat a short first line
       as the title (weighted slightly lower). */
    if (sections.title.length === 0 && lines.length) {
      for (var j = 0; j < lines.length; j++) {
        var first = lines[j].trim();
        if (first && first.length <= 80 && first.split(/\s+/).length <= 12) {
          sections.title.push(first);
          break;
        }
      }
    }
    return sections;
  }

  /* ---------- keyword extraction ---------- */

  function addKeyword(map, display, weight, must) {
    var words = tokenize(display);
    var kept = [];
    var stems = [];
    for (var i = 0; i < words.length; i++) {
      if (!isContentWord(words[i])) { return; } /* drop if any word is noise */
      kept.push(words[i]);
      stems.push(stem(words[i]));
    }
    if (!stems.length) { return; }
    var key = stems.join(" ");
    if (!map[key]) {
      map[key] = { display: display, words: kept, stems: stems, weight: 0, count: 0, must: false };
    }
    map[key].weight = Math.max(map[key].weight, weight);
    map[key].count += 1;
    if (must) { map[key].must = true; }
  }

  /* Unigrams + bigrams from one line. Bigrams only form between words
     that are adjacent in the ORIGINAL text — filtering stopwords first
     would invent junk pairs like "production typescript". */
  function addLineKeywords(map, line, weight, must) {
    var raw = tokenize(line);
    for (var i = 0; i < raw.length; i++) {
      if (!isContentWord(raw[i])) { continue; }
      addKeyword(map, raw[i], weight, must);
      if (i > 0 && isContentWord(raw[i - 1])) {
        addKeyword(map, raw[i - 1] + " " + raw[i], weight * 1.5, must);
      }
    }
  }

  function extractKeywords(parsed) {
    var map = {};

    parsed.title.forEach(function (line) { addLineKeywords(map, line, 3, true); });
    parsed.req.forEach(function (line) { addLineKeywords(map, line, 2, true); });
    parsed.nice.forEach(function (line) { addLineKeywords(map, line, 1.5, false); });
    parsed.body.forEach(function (line) { addLineKeywords(map, line, 1, false); });

    var keywords = [];
    for (var key in map) {
      if (Object.prototype.hasOwnProperty.call(map, key)) { keywords.push(map[key]); }
    }

    /* If the JD had no recognizable requirements section, promote
       the top third of keywords by weight to must-have. */
    var mustCount = keywords.filter(function (k) { return k.must; }).length;
    if (mustCount < 4 && keywords.length >= 6) {
      var sorted = keywords.slice().sort(function (a, b) { return b.weight * b.count - a.weight * a.count; });
      var promote = Math.max(4, Math.ceil(sorted.length / 3));
      for (var i = 0; i < Math.min(promote, sorted.length); i++) { sorted[i].must = true; }
    }

    keywords.sort(function (a, b) {
      if (a.must !== b.must) { return a.must ? -1 : 1; }
      return (b.weight * b.count) - (a.weight * a.count);
    });
    return keywords;
  }

  /* ---------- resume matching ---------- */

  function buildResumeIndex(resumeText) {
    var tokens = tokenize(resumeText);
    var stems = {};
    var exact = {};
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      exact[t] = (exact[t] || 0) + 1;
      var s = stem(t);
      if (!stems[s]) { stems[s] = { count: 0, forms: {} }; }
      stems[s].count += 1;
      stems[s].forms[t] = (stems[s].forms[t] || 0) + 1;
    }
    var stemList = [];
    for (var key in stems) {
      if (Object.prototype.hasOwnProperty.call(stems, key)) { stemList.push(key); }
    }
    return { tokens: tokens, stems: stems, exact: exact, stemList: stemList };
  }

  function keywordPresent(k, index) {
    for (var i = 0; i < k.stems.length; i++) {
      if (!index.stems[k.stems[i]]) { return false; }
    }
    return true;
  }

  function keywordExact(k, index) {
    for (var i = 0; i < k.words.length; i++) {
      if (!index.exact[k.words[i]]) { return false; }
    }
    return true;
  }

  /* True when a missing keyword has a plausible variant in the
     resume (e.g. missing "management" but resume says "managing"). */
  function plausibleVariant(k, index) {
    for (var i = 0; i < k.stems.length; i++) {
      var s = k.stems[i];
      if (s.length < 4) { return false; }
      var prefixLen = Math.min(5, s.length);
      var prefix = s.slice(0, prefixLen);
      var found = false;
      for (var j = 0; j < index.stemList.length; j++) {
        var r = index.stemList[j];
        if (r.length >= 4 && r.slice(0, Math.min(prefixLen, r.length)) === prefix) { found = true; break; }
      }
      if (!found) { return false; }
    }
    return true;
  }

  /* ---------- ATS format checks ---------- */

  var FANCY_BULLET_RE = /^[•●◦‣⁃·▪○♦►★→✓✔*‣●]/;

  function runChecks(resumeText) {
    var text = String(resumeText || "");
    var lines = text.split(/\r?\n/);
    var checks = [];
    var low = text.toLowerCase();

    /* 1. Email */
    var hasEmail = /[\w.+-]+@[\w-]+\.[\w.\-]+/.test(text);
    checks.push({
      id: "email",
      label: "Email address is present",
      status: hasEmail ? "pass" : "fail",
      detail: hasEmail
        ? "A plain-text email address was found — ATS parsers can read your contact info."
        : "No email address detected. Put a plain-text email at the top of your resume (never inside a header image or text box)."
    });

    /* 2. Phone */
    var hasPhone = /(?:\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}\b/.test(text.replace(/[\u2013\u2014]/g, "-"));
    checks.push({
      id: "phone",
      label: "Phone number is present",
      status: hasPhone ? "pass" : "fail",
      detail: hasPhone
        ? "A phone number was found in a standard format."
        : "No phone number detected. Add one in a standard format like 555-123-4567 near your email."
    });

    /* 3. Standard section headers */
    var headerTests = [
      { name: "Experience", re: /^(work\s+|professional\s+|relevant\s+)?(experience|employment|work\s+history)\b/i },
      { name: "Education", re: /^(education|academic\s+background)\b/i },
      { name: "Skills", re: /^(technical\s+|core\s+|key\s+)?(skills|competencies|technical\s+proficiencies)\b/i },
      { name: "Summary", re: /^(professional\s+|career\s+)?(summary|profile|objective)\b/i }
    ];
    var found = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line.length > 60) { continue; }
      for (var h = 0; h < headerTests.length; h++) {
        if (headerTests[h].re.test(line) && found.indexOf(headerTests[h].name) === -1) {
          found.push(headerTests[h].name);
        }
      }
    }
    var secStatus = found.length >= 3 ? "pass" : (found.length === 2 ? "warn" : "fail");
    checks.push({
      id: "sections",
      label: "Recognized section headers (" + found.length + "/4)",
      status: secStatus,
      detail: found.length >= 3
        ? "Standard headers found: " + found.join(", ") + ". ATS parsers map these reliably."
        : "Found: " + (found.length ? found.join(", ") : "none") + ". Use plain headers — Experience, Education, Skills, and a Summary — so the ATS can route your content correctly."
    });

    /* 4. Consistent date formats */
    var monthName = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*'?\d{2,4}\b/gi) || [];
    var numeric = text.match(/\b(0?[1-9]|1[0-2])\/(19|20)\d{2}\b/g) || [];
    var yearOnly = text.match(/\b(19|20)\d{2}\b/g) || [];
    var styles = [];
    if (monthName.length) { styles.push("Month Year"); }
    if (numeric.length) { styles.push("MM/YYYY"); }
    if (yearOnly.length && !monthName.length && !numeric.length) { styles.push("Year only"); }
    var dateStatus = "pass";
    var dateDetail = "Date formats look consistent.";
    if (!styles.length) {
      dateStatus = "warn";
      dateDetail = "No dates detected. Every role should carry a start and end date (e.g. 'Jun 2021 – Present') so ATS systems can compute tenure.";
    } else if (styles.length > 1) {
      dateStatus = "warn";
      dateDetail = "Mixed date styles detected (" + styles.join(" + ") + "). Pick one format — e.g. 'Jun 2021 – Present' everywhere — so parsing stays clean.";
    }
    checks.push({ id: "dates", label: "Consistent date formats", status: dateStatus, detail: dateDetail });

    /* 5. First-person / buzzword phrasing */
    var firstPerson = (low.match(/\b(?:i|me|my|mine|myself)\b/g) || []).length;
    var responsible = (low.match(/responsible for/g) || []).length;
    var flags = firstPerson + responsible;
    var personStatus = flags === 0 ? "pass" : (flags <= 2 ? "warn" : "fail");
    checks.push({
      id: "person",
      label: "No first-person or 'responsible for' phrasing",
      status: personStatus,
      detail: flags === 0
        ? "Clean action-verb style — no 'I/my' or 'responsible for' phrasing found."
        : "Found " + flags + " issue" + (flags === 1 ? "" : "s") + " (" +
          (firstPerson ? firstPerson + " first-person pronoun" + (firstPerson === 1 ? "" : "s") : "") +
          (firstPerson && responsible ? ", " : "") +
          (responsible ? responsible + " use" + (responsible === 1 ? "" : "s") + " of 'responsible for'" : "") +
          "). Start bullets with action verbs: 'Led…', 'Built…', 'Reduced…'."
    });

    /* 6. Length guidance */
    var wordCount = (text.match(/\S+/g) || []).length;
    var lenStatus = "pass";
    var lenDetail = "Length looks right (" + wordCount + " words) — detailed enough for ATS keywords, short enough for a recruiter.";
    if (wordCount < 300) {
      lenStatus = "warn";
      lenDetail = "Only " + wordCount + " words. Resumes under ~300 words rarely carry enough keyword detail. Aim for 400–800 words (1–2 pages).";
    } else if (wordCount > 1000) {
      lenStatus = "warn";
      lenDetail = wordCount + " words is long. Trim toward 400–800 words (1–2 pages); recruiters skim the first screen.";
    }
    checks.push({ id: "length", label: "Resume length (" + wordCount + " words)", status: lenStatus, detail: lenDetail });

    /* 7. Special-character bullets */
    var fancyLines = 0;
    for (var b = 0; b < lines.length; b++) {
      var trimmed = lines[b].trim();
      if (trimmed && FANCY_BULLET_RE.test(trimmed)) { fancyLines++; }
    }
    checks.push({
      id: "bullets",
      label: "ATS-safe bullet characters",
      status: fancyLines === 0 ? "pass" : "warn",
      detail: fancyLines === 0
        ? "No special-character bullets found — plain characters parse cleanly."
        : "Found " + fancyLines + " line" + (fancyLines === 1 ? "" : "s") + " starting with a special character (•, ●, ▪, →…). Some ATS parsers mangle these; replace them with plain hyphens."
    });

    return checks;
  }

  /* ---------- scoring + public analyze ---------- */

  function band(score) {
    if (score < 50) { return "red"; }
    if (score < 75) { return "amber"; }
    return "green";
  }

  function analyze(resumeText, jdText) {
    var parsed = parseJD(jdText);
    var keywords = extractKeywords(parsed);
    if (!keywords.length) {
      return null;
    }

    var index = buildResumeIndex(resumeText);

    keywords.forEach(function (k) {
      k.present = keywordPresent(k, index);
      k.exactInResume = k.present && keywordExact(k, index);
      k.plausibleVariant = !k.present && plausibleVariant(k, index);
      k.power = k.weight * k.count;
    });

    var must = keywords.filter(function (k) { return k.must; });
    var nice = keywords.filter(function (k) { return !k.must; });

    /* Power-weighted coverage: hitting "typescript" (title/requirements,
       repeated) moves the needle more than hitting a one-off filler term. */
    var mustPowerAll = 0, mustPowerHit = 0, nicePowerAll = 0, nicePowerHit = 0;
    must.forEach(function (k) {
      mustPowerAll += k.power;
      if (k.present) { mustPowerHit += k.power; }
    });
    nice.forEach(function (k) {
      nicePowerAll += k.power;
      if (k.present) { nicePowerHit += k.power; }
    });

    var mustCov = mustPowerAll ? mustPowerHit / mustPowerAll : 1;
    var niceCov = nicePowerAll ? nicePowerHit / nicePowerAll : 1;
    var score = Math.round(100 * (0.7 * mustCov + 0.3 * niceCov));

    var missing = keywords
      .filter(function (k) { return !k.present; })
      .sort(function (a, b) {
        if (a.must !== b.must) { return a.must ? -1 : 1; }
        return b.power - a.power;
      });

    var jdTitle = (parsed.title[0] || "").replace(/^job\s*title\s*[:\-–—]\s*/i, "").trim() || "the role";

    return {
      score: score,
      band: band(score),
      wordCount: index.tokens.length,
      jdTitle: jdTitle,
      must: must,
      nice: nice,
      missing: missing,
      checks: runChecks(resumeText)
    };
  }

  /* Build a clean, copy-pasteable skills block from an ordered
     list of skill display names. */
  function formatSkillsBlock(skills) {
    return "CORE SKILLS\n" + skills.join("  |  ");
  }

  window.HireProofEngine = {
    tokenize: tokenize,
    stem: stem,
    parseJD: parseJD,
    extractKeywords: extractKeywords,
    runChecks: runChecks,
    analyze: analyze,
    band: band,
    formatSkillsBlock: formatSkillsBlock
  };
})();
