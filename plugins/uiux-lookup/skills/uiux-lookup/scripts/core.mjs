// BM25 search over the uiux-lookup CSV data. Dependency-free, offline.
// Ported from ui-ux-pro-max v2.15.0 scripts/core.py (MIT, Next Level Builder),
// keeping only the ux, app, fonts and icons domains and the stack search.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
export const MAX_RESULTS = 3;
export const MAX_QUERY_LENGTH = 300;

const RULE_COLS = ['Category', 'Issue', 'Platform', 'Description', 'Do', "Don't",
  'Code Example Good', 'Code Example Bad', 'Severity'];

export const DOMAINS = {
  ux: {
    file: 'ux-guidelines.csv',
    searchCols: ['Category', 'Issue', 'Description', 'Platform'],
    outputCols: RULE_COLS,
  },
  app: {
    file: 'app-interface.csv',
    searchCols: ['Category', 'Issue', 'Keywords', 'Description'],
    outputCols: RULE_COLS,
  },
  fonts: {
    file: 'google-fonts.csv',
    searchCols: ['Family', 'Category', 'Stroke', 'Classifications', 'Keywords', 'Subsets', 'Designers'],
    outputCols: ['Family', 'Category', 'Stroke', 'Classifications', 'Styles', 'Variable Axes',
      'Subsets', 'Designers', 'Popularity Rank', 'Google Fonts URL'],
  },
  icons: {
    file: 'icons.csv',
    searchCols: ['Category', 'Icon Name', 'Keywords', 'Best For', 'Library'],
    outputCols: ['Category', 'Icon Name', 'Keywords', 'Library', 'Import Code', 'Usage',
      'Best For', 'Style', 'Semantic Role', 'Allowed Contexts'],
  },
};

export const DOMAIN_ALIASES = { web: 'app', 'google-fonts': 'fonts', font: 'fonts', icon: 'icons' };

export const STACKS = ['react', 'nextjs', 'vue', 'svelte', 'astro', 'swiftui', 'react-native',
  'flutter', 'nuxtjs', 'nuxt-ui', 'html-tailwind', 'shadcn', 'jetpack-compose', 'threejs',
  'angular', 'laravel', 'javafx', 'wpf', 'winui', 'avalonia', 'uno', 'uwp'];

export const STACK_ALIASES = {
  next: 'nextjs', 'next.js': 'nextjs', nuxt: 'nuxtjs', tailwind: 'html-tailwind',
  compose: 'jetpack-compose', rn: 'react-native', three: 'threejs', 'three.js': 'threejs',
  ios: 'swiftui', 'shadcn-ui': 'shadcn',
};

const STACK_SEARCH_COLS = ['Category', 'Guideline', 'Description', 'Do', "Don't", 'Code Good', 'Code Bad'];
export const STACK_OUTPUT_COLS = ['Category', 'Guideline', 'Description', 'Do', "Don't",
  'Code Good', 'Code Bad', 'Severity', 'Docs URL', 'Applies To', 'Status', 'Verified At'];

export const UNTRUNCATED_COLS = new Set(['Code Example Good', 'Code Example Bad', 'Code Good',
  'Code Bad', 'Import Code']);

const STACK_CURRENT_VERSIONS = {
  react: [19], nextjs: [16], vue: [3], svelte: [5], astro: [7], angular: [22],
  'html-tailwind': [4], nuxtjs: [4], 'nuxt-ui': [4],
  'react-native': [0, 86], flutter: [3, 44], swiftui: [16], 'jetpack-compose': [1, 11],
  avalonia: [12], winui: [3], javafx: [26], threejs: [0, 185], laravel: [13],
};
const LEGACY_ONLY_STACKS = new Set(['uwp']);
const STACK_QUERY_NAMES = {
  react: 'react', nextjs: 'next(?:\\.js|js)?', vue: 'vue', svelte: 'svelte', astro: 'astro',
  angular: 'angular', 'html-tailwind': 'tailwind(?:\\s*css)?', nuxtjs: 'nuxt(?:\\.js|js)?',
  'nuxt-ui': 'nuxt\\s*ui', 'react-native': 'react[\\s-]*native', flutter: 'flutter',
  swiftui: '(?:ios|swiftui\\s+ios)', 'jetpack-compose': '(?:jetpack\\s*)?compose',
  avalonia: 'avalonia', winui: 'winui', javafx: 'javafx', threejs: 'three(?:\\.js|js)?',
  laravel: 'laravel',
};

const NO_THRESHOLD = { minScore: 0, minCoverage: 0 };
const DOMAIN_THRESHOLDS = { ux: NO_THRESHOLD, app: NO_THRESHOLD, fonts: NO_THRESHOLD,
  icons: { minScore: 5.8, minCoverage: 0 } };
const STACK_THRESHOLD = { minScore: 3.6, minCoverage: 1 / 3 };

// Routing-only vocabulary that is absent from a corpus gets a semantic rewrite.
const DOMAIN_QUERY_REWRITES = {
  ux: { ux: 'accessibility', usability: 'accessibility', wcag: 'accessibility' },
  fonts: { typography: 'font' },
  icons: { lucide: null, symbol: null, glyph: null, pictogram: null },
  app: { aria: 'accessibility', outline: 'focus', semantic: null, autocomplete: 'input', preconnect: null },
};

const DOMAIN_KEYWORDS = {
  ux: ['ux', 'usability', 'accessibility', 'wcag', 'touch', 'scroll', 'animation', 'keyboard',
    'navigation', 'mobile', 'focus', 'form', 'contrast', 'error', 'loading', 'layout'],
  fonts: ['google font', 'font family', 'font weight', 'font style', 'variable font', 'noto',
    'font for', 'find font', 'font subset', 'font language', 'monospace font', 'serif font',
    'sans serif font', 'display font', 'handwriting font', 'font', 'typography', 'serif', 'sans'],
  icons: ['icon', 'icons', 'lucide', 'phosphor', 'heroicons', 'symbol', 'glyph', 'pictogram', 'svg icon'],
  app: ['aria', 'focus', 'outline', 'semantic', 'virtualize', 'autocomplete', 'form', 'input type',
    'preconnect', 'drag reorder', 'single pointer', 'touch target', 'native accessibility',
    'react native', 'ios', 'android', 'safe area', 'accessibilitylabel'],
};
const DOMAIN_TIEBREAK = ['ux', 'fonts', 'icons', 'app'];

// ============ TOKENIZATION ============
const W = '[\\p{L}\\p{N}_]';
const STOPWORDS = new Set(['to', 'in', 'on', 'at', 'is', 'of', 'by', 'or', 'an', 'if', 'no', 'so',
  'do', 'be', 'we', 'it', 'as', 'the', 'and', 'for', 'are', 'was']);
const SYNONYMS = {
  'q&a': 'question answer', 'e-commerce': 'ecommerce', 'dark-mode': 'dark', darkmode: 'dark',
  'light-mode': 'light', lightmode: 'light', a11y: 'accessibility', nav: 'navigation',
  'sign-up': 'signup', 'log-in': 'login', colour: 'color', colours: 'colors',
  customisation: 'customization', organisation: 'organization', behaviour: 'behavior',
  'ux/ui': 'ux ui',
};
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SYNONYM_PATTERNS = Object.entries(SYNONYMS)
  .sort((a, b) => b[0].length - a[0].length)
  .map(([variant, canonical]) => [new RegExp(`(?<!${W})${escapeRe(variant)}(?!${W})`, 'giu'), canonical]);

export function normalize(text) {
  let out = String(text);
  for (const [re, canonical] of SYNONYM_PATTERNS) out = out.replace(re, canonical);
  return out;
}

export function tokenize(text) {
  const cleaned = normalize(String(text).toLowerCase()).replace(/[^\p{L}\p{N}_\s]/gu, ' ');
  return cleaned.split(/\s+/).filter((w) => [...w].length >= 2 && !STOPWORDS.has(w));
}

// ============ BM25 ============
export class BM25 {
  constructor(k1 = 1.5, b = 0.75) {
    this.k1 = k1; this.b = b;
    this.N = 0; this.avgdl = 0; this.docLengths = []; this.termFreqs = [];
    this.docFreqs = new Map(); this.idf = new Map();
  }

  fit(documents) {
    const corpus = documents.map(tokenize);
    this.N = corpus.length;
    if (!this.N) return this;
    this.docLengths = corpus.map((d) => d.length);
    this.avgdl = this.docLengths.reduce((a, n) => a + n, 0) / this.N || 1;
    for (const doc of corpus) {
      const tf = new Map();
      for (const w of doc) tf.set(w, (tf.get(w) || 0) + 1);
      this.termFreqs.push(tf);
      for (const w of tf.keys()) this.docFreqs.set(w, (this.docFreqs.get(w) || 0) + 1);
    }
    for (const [w, f] of this.docFreqs) this.idf.set(w, Math.log((this.N - f + 0.5) / (f + 0.5) + 1));
    return this;
  }

  score(query) {
    const q = tokenize(query);
    const scores = [];
    for (let i = 0; i < this.N; i++) {
      let s = 0;
      const dl = this.docLengths[i];
      const tfs = this.termFreqs[i];
      for (const t of q) {
        const idf = this.idf.get(t);
        if (idf === undefined) continue;
        const tf = tfs.get(t) || 0;
        s += idf * (tf * (this.k1 + 1)) / (tf + this.k1 * (1 - this.b + this.b * dl / this.avgdl));
      }
      scores.push([i, s]);
    }
    return scores.sort((a, b) => b[1] - a[1]); // stable: ties keep row order
  }

  vocabulary() { return [...this.idf.keys()]; }
}

// difflib.SequenceMatcher(None, a, b).ratio() for short strings (no junk heuristic).
export function similarity(a, b) {
  const total = a.length + b.length;
  if (!total) return 1;
  const longest = (alo, ahi, blo, bhi) => {
    let bi = alo, bj = blo, size = 0;
    let prev = new Map();
    for (let i = alo; i < ahi; i++) {
      const cur = new Map();
      for (let j = blo; j < bhi; j++) {
        if (a[i] !== b[j]) continue;
        const k = (prev.get(j - 1) || 0) + 1;
        cur.set(j, k);
        if (k > size) { bi = i - k + 1; bj = j - k + 1; size = k; }
      }
      prev = cur;
    }
    return [bi, bj, size];
  };
  let matches = 0;
  const stack = [[0, a.length, 0, b.length]];
  while (stack.length) {
    const [alo, ahi, blo, bhi] = stack.pop();
    const [i, j, k] = longest(alo, ahi, blo, bhi);
    if (!k) continue;
    matches += k;
    if (alo < i && blo < j) stack.push([alo, i, blo, j]);
    if (i + k < ahi && j + k < bhi) stack.push([i + k, ahi, j + k, bhi]);
  }
  return (2 * matches) / total;
}

// ============ CSV ============
export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows.filter((r) => !(r.length === 1 && r[0] === ''));
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const csvCache = new Map();
export function loadCsv(relPath) {
  if (!csvCache.has(relPath)) csvCache.set(relPath, parseCsv(readFileSync(join(DATA_DIR, relPath), 'utf8')));
  return csvCache.get(relPath);
}

let fontLicenses = null;
function fontLicense(family) {
  if (!fontLicenses) {
    fontLicenses = new Map();
    try {
      const data = JSON.parse(readFileSync(join(DATA_DIR, 'google-font-licenses.json'), 'utf8'));
      for (const f of data.families || []) fontLicenses.set(f.name, f.license);
    } catch { /* licence column stays empty */ }
  }
  return fontLicenses.get(family) || '';
}

// ============ SEARCH ============
const project = (row, cols) => Object.fromEntries(cols.filter((c) => c in row).map((c) => [c, row[c]]));
const containsPhrase = (text, phrase) => (/\w/.test(phrase)
  ? new RegExp(`(?<!${W})${escapeRe(phrase)}(?!${W})`, 'u').test(text)
  : text.includes(phrase));

function coverage(index, query) {
  const tokens = new Set(tokenize(query));
  if (!tokens.size) return 0;
  let hit = 0;
  for (const t of tokens) if (index.idf.has(t)) hit++;
  return hit / tokens.size;
}

function passesThreshold(index, query, th) {
  const ranked = index.score(query);
  const top = ranked.length ? ranked[0][1] : 0;
  return top > th.minScore && coverage(index, query) >= th.minCoverage;
}

function suggestTerms(index, query, threshold, limit = 6) {
  if (!index) return [];
  const qt = new Set(tokenize(query));
  if (!qt.size) return [];
  const cands = [];
  for (const term of index.vocabulary()) {
    if (qt.has(term)) continue;
    let sim = 0;
    for (const t of qt) sim = Math.max(sim, similarity(t, term));
    if (sim >= 0.72 && (!threshold || passesThreshold(index, term, threshold))) {
      cands.push([-sim, -(index.docFreqs.get(term) || 0), term]);
    }
  }
  cands.sort((x, y) => x[0] - y[0] || x[1] - y[1] || (x[2] < y[2] ? -1 : x[2] > y[2] ? 1 : 0));
  return cands.slice(0, limit).map((c) => c[2]);
}

function rewriteQuery(query, domain, index) {
  const keywords = DOMAIN_KEYWORDS[domain];
  if (!keywords) return [query, []];
  const normalized = normalize(query.toLowerCase());
  const rewrites = new Set(), terms = new Set();
  for (const kw of keywords) {
    if (!containsPhrase(normalized, kw)) continue;
    if (tokenize(kw).some((t) => index.idf.has(t))) continue;
    const replacement = DOMAIN_QUERY_REWRITES[domain]?.[kw];
    if (replacement) { rewrites.add(`${kw}->${replacement}`); terms.add(replacement); }
  }
  if (!terms.size) return [query, []];
  return [`${query} ${[...terms].sort().join(' ')}`, [...rewrites].sort()];
}

function searchRows(rows, searchCols, outputCols, query, maxResults, threshold, domain) {
  if (!rows.length) return { results: [], index: null, diagnostic: { reason: 'empty-data' } };
  const index = new BM25().fit(rows.map((r) => searchCols.map((c) => r[c] ?? '').join(' ')));
  const [searchQuery, rewrites] = domain ? rewriteQuery(query, domain, index) : [query, []];
  const ranked = index.score(searchQuery);
  const th = threshold || NO_THRESHOLD;
  const top = ranked.length ? ranked[0][1] : 0;
  const cov = coverage(index, searchQuery);
  const abstain = top <= th.minScore || cov < th.minCoverage;
  const results = [];
  if (!abstain) {
    for (const [i, s] of ranked.slice(0, maxResults)) if (s > 0) results.push(project(rows[i], outputCols));
  }
  return {
    results, index,
    diagnostic: { searchQuery, rewrites, topScore: top, coverage: cov, abstained: abstain,
      reason: abstain ? 'low-confidence' : 'matched' },
  };
}

export function resolveDomain(name) {
  if (name == null) return null;
  const key = String(name).toLowerCase();
  return DOMAINS[key] ? key : DOMAIN_ALIASES[key] || undefined;
}

export function resolveStack(name) {
  const key = String(name ?? '').toLowerCase();
  return STACKS.includes(key) ? key : STACK_ALIASES[key];
}

export function detectDomain(query) {
  const q = normalize(String(query).toLowerCase());
  let best = 'ux', bestScore = 0;
  for (const domain of DOMAIN_TIEBREAK) {
    let total = 0;
    for (const kw of DOMAIN_KEYWORDS[domain]) {
      if (containsPhrase(q, kw)) total += 2 * Math.max(1, kw.split(/\s+/).length);
    }
    if (total > bestScore) { best = domain; bestScore = total; }
  }
  return best;
}

function isFontFamily(query) {
  const q = query.trim().toLowerCase();
  try { return loadCsv(DOMAINS.fonts.file).some((r) => r.Family.toLowerCase() === q); } catch { return false; }
}

const validMax = (n) => Number.isInteger(n) && n >= 1 && n <= 20;
const boundQuery = (q) => String(q ?? '').slice(0, MAX_QUERY_LENGTH);

export function search(rawQuery, { domain = null, maxResults = MAX_RESULTS, diagnostics = false } = {}) {
  const query = boundQuery(rawQuery);
  if (!validMax(maxResults)) return { error: 'max results must be an integer from 1 to 20' };
  const autoDetected = domain == null;
  const name = autoDetected ? (isFontFamily(query) ? 'fonts' : detectDomain(query)) : resolveDomain(domain);
  if (!name) return { error: `Unknown domain: ${domain}. Available: ${Object.keys(DOMAINS).join(', ')}` };
  const config = DOMAINS[name];
  if (!existsSync(join(DATA_DIR, config.file))) return { error: `Data file missing: ${config.file}`, domain: name };

  let rows;
  try { rows = loadCsv(config.file); } catch { return { error: `Unable to read search data: ${config.file}`, domain: name }; }

  let results, index = null, diagnostic;
  const exact = name === 'fonts'
    ? rows.filter((r) => r.Family.toLowerCase() === query.trim().toLowerCase()) : [];
  if (exact.length === 1) {
    results = [project(exact[0], config.outputCols)];
    diagnostic = { reason: 'exact-identity', abstained: false };
  } else {
    ({ results, index, diagnostic } = searchRows(rows, config.searchCols, config.outputCols, query,
      maxResults, DOMAIN_THRESHOLDS[name], name));
  }
  if (name === 'icons' && containsPhrase(normalize(query.toLowerCase()), 'lucide')) {
    results = [];
    diagnostic = { ...diagnostic, abstained: true, reason: 'unsupported-library' };
  }
  if (name === 'fonts') for (const r of results) r.License = fontLicense(r.Family);

  const out = { domain: name, query, file: config.file, total: rows.length, count: results.length, results };
  if (autoDetected) out.autoDetected = true;
  if (!results.length) out.suggestions = diagnostic.reason === 'unsupported-library'
    ? [] : suggestTerms(index, query, DOMAIN_THRESHOLDS[name]);
  if (diagnostics) out.diagnostics = diagnostic;
  return out;
}

// ============ STACK SEARCH ============
function cmpTuple(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

const MIGRATION_RE = /\b(?:migrat\w*|upgrad\w*|replac\w*|instead|modern|current)\b/;

export function stackQueryRequestsLegacy(query, stack) {
  const normalized = normalize(String(query ?? '').toLowerCase());
  if (LEGACY_ONLY_STACKS.has(stack)) return true;
  const current = STACK_CURRENT_VERSIONS[stack];
  const stackName = STACK_QUERY_NAMES[stack];
  if (current && stackName) {
    const re = new RegExp(`\\b(?:${stackName})\\s*(?:sdk|ui)?\\s*(?:[@(]\\s*)?(?:v(?:ersion)?\\s*)?(\\d+)(?:\\.(\\d+))?\\s*\\)?`, 'g');
    const requested = [...normalized.matchAll(re)]
      .map((m) => m.slice(1).filter((v) => v !== undefined).map(Number));
    if (stack === 'threejs') for (const m of normalized.matchAll(/\br(\d+)\b/g)) requested.push([0, Number(m[1])]);
    const migration = MIGRATION_RE.test(normalized);
    if (requested.length) {
      if (migration && requested.some((r) => cmpTuple(r, current.slice(0, r.length)) >= 0)) return false;
      return requested.every((r) => cmpTuple(r, current.slice(0, r.length)) < 0);
    }
  }
  if (MIGRATION_RE.test(normalized)) return false;
  return /\b(?:legacy|deprecated)\b/.test(normalized);
}

function stackRowFilter(rows, query, stack) {
  const statuses = new Set(rows.map((r) => r.Status || 'unverified'));
  const requestsLegacy = stackQueryRequestsLegacy(query, stack);
  let statusFilter, variant;
  if (statuses.has('deprecated') && requestsLegacy) {
    statusFilter = (r) => r.Status === 'deprecated'; variant = 'legacy-only';
  } else if (requestsLegacy && STACK_CURRENT_VERSIONS[stack]) {
    return [() => false, 'legacy-unavailable'];
  } else if (statuses.has('active')) {
    statusFilter = (r) => r.Status === 'active'; variant = 'current-only';
  } else {
    statusFilter = (r) => (r.Status || 'unverified') !== 'deprecated'; variant = 'non-legacy';
  }
  if (stack !== 'shadcn') return [statusFilter, variant];
  const normalized = normalize(String(query ?? '').toLowerCase());
  let base;
  if (normalized.includes('base ui')) base = 'base';
  else if (normalized.includes('react aria')) base = 'aria';
  else if (normalized.includes('radix') || normalized.includes('aschild')) base = 'radix';
  else return [statusFilter, variant];
  const matchesBase = (r) => {
    const m = /\bbase=([^;]+)/.exec((r['Applies To'] || '').toLowerCase());
    return statusFilter(r) && (m ? m[1].split('|') : []).includes(base);
  };
  return [matchesBase, `${variant};base=${base}`];
}

function exactStackIdentifier(rows, query, filter) {
  const id = String(query ?? '').trim();
  if (id.length < 6 || /\s/.test(id)) return null;
  const re = new RegExp(`(?<![A-Za-z0-9_])${escapeRe(id)}(?![A-Za-z0-9_])`, 'i');
  const fields = ['Guideline', 'Description', 'Do', "Don't", 'Code Good', 'Code Bad'];
  const matches = rows.filter((r) => filter(r) && fields.some((f) => re.test(r[f] || '')));
  return matches.length === 1 ? matches[0] : null;
}

function legacySuccessorGuidance(rows, query, stack, filter) {
  const normalized = normalize(String(query ?? '').toLowerCase());
  if (!LEGACY_ONLY_STACKS.has(stack)
    || !/\b(?:brand new|new)\s+(?:app|application|project)\b/.test(normalized)) return null;
  const matches = rows.filter((r) => filter(r) && /\b(?:prefer|choose|use)\b.*\bnew (?:apps?|projects?)\b/
    .test([r.Guideline, r.Description, r.Do].join(' ').toLowerCase()));
  return matches.length === 1 ? matches[0] : null;
}

export function searchStack(rawQuery, stackName, { maxResults = MAX_RESULTS, diagnostics = false } = {}) {
  const query = boundQuery(rawQuery);
  if (!validMax(maxResults)) return { error: 'max results must be an integer from 1 to 20' };
  const stack = resolveStack(stackName);
  if (!stack) return { error: `Unknown stack: ${stackName}. Available: ${STACKS.join(', ')}` };
  const file = `stacks/${stack}.csv`;
  if (!existsSync(join(DATA_DIR, file))) return { error: `Stack file missing: ${file}`, stack };

  let rows;
  try { rows = loadCsv(file); } catch { return { error: `Unable to read search data: ${file}`, stack }; }
  const [filter, variant] = stackRowFilter(rows, query, stack);
  const threshold = variant === 'legacy-only' ? NO_THRESHOLD : STACK_THRESHOLD;
  const exact = legacySuccessorGuidance(rows, query, stack, filter) || exactStackIdentifier(rows, query, filter);
  let results, index = null, diagnostic;
  if (exact) {
    results = [project(exact, STACK_OUTPUT_COLS)];
    diagnostic = { reason: 'exact-identifier', abstained: false, variant };
  } else {
    ({ results, index, diagnostic } = searchRows(rows.filter(filter), STACK_SEARCH_COLS,
      STACK_OUTPUT_COLS, query, maxResults, threshold, null));
    diagnostic.variant = variant;
  }
  const out = { domain: 'stack', stack, query, file, total: rows.length, count: results.length, results };
  if (!results.length) {
    out.suggestions = suggestTerms(index, query, threshold);
    if (variant === 'legacy-unavailable') out.note = `No curated guidance for that older ${stack} version; rows cover the current line only.`;
  }
  if (diagnostics) out.diagnostics = diagnostic;
  return out;
}
