#!/usr/bin/env node
// uiux-lookup CLI: compact, offline BM25 search over cited UI/UX rules,
// stack UI guidelines, Google Fonts metadata and curated icons.
// Ported from ui-ux-pro-max v2.15.0 scripts/search.py (MIT, Next Level Builder).

import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { STACKS, MAX_RESULTS, UNTRUNCATED_COLS, search, searchStack } from './core.mjs';

const TRUNCATE_AT = 300;

const USAGE = `Usage: node search.mjs "<query>" [--domain ux|app|fonts|icons] [--stack <name>]
                      [-n 1-20] [--full] [--json]
Domains: ux (119 UX/WCAG rules), app (native/mobile app rules), fonts (Google Fonts
         metadata + licence), icons (curated Phosphor icons). Omit to auto-detect.
Stacks:  ${STACKS.join(', ')}`;

// Per-result layout: a title, bracketed tags, then labelled lines.
const LAYOUTS = {
  rule: {
    title: (r) => `${r.Category} / ${r.Issue}`,
    tags: (r) => [r.Severity, r.Platform],
    lines: [['', 'Description'], ['Do', 'Do'], ["Don't", "Don't"],
      ['Good', 'Code Example Good'], ['Bad', 'Code Example Bad']],
  },
  fonts: {
    title: (r) => r.Family,
    tags: (r) => [r.Category, r.License && `licence ${r.License}`,
      r['Popularity Rank'] && `popularity #${r['Popularity Rank']}`],
    lines: [['Styles', 'Styles'], ['Axes', 'Variable Axes'], ['Subsets', 'Subsets'],
      ['Designers', 'Designers'], ['Classes', 'Classifications'], ['URL', 'Google Fonts URL']],
  },
  icons: {
    title: (r) => `${r['Icon Name']} (${r.Library})`,
    tags: (r) => [r.Category, r.Style],
    lines: [['Import', 'Import Code'], ['Usage', 'Usage'], ['Best for', 'Best For'],
      ['Contexts', 'Allowed Contexts']],
  },
  stack: {
    title: (r) => `${r.Category} / ${r.Guideline}`,
    tags: (r) => [r.Severity, r.Status !== 'active' && r.Status],
    lines: [['', 'Description'], ['Do', 'Do'], ["Don't", "Don't"], ['Good', 'Code Good'],
      ['Bad', 'Code Bad'], ['Docs', 'Docs URL']],
  },
};
const layoutFor = (result) => (result.stack ? LAYOUTS.stack
  : result.domain === 'fonts' ? LAYOUTS.fonts
    : result.domain === 'icons' ? LAYOUTS.icons : LAYOUTS.rule);

const clip = (key, value, full) => {
  const v = String(value).replace(/\s*\n\s*/g, ' ').trim();
  return !full && !UNTRUNCATED_COLS.has(key) && v.length > TRUNCATE_AT ? `${v.slice(0, TRUNCATE_AT)}...` : v;
};

export function formatResult(result, { full = false } = {}) {
  if (result.error) return `Error: ${result.error}`;
  const scope = result.stack ? `stack ${result.stack}` : `${result.domain}${result.autoDetected ? ' (auto)' : ''}`;
  const out = [`${scope} | "${result.query}" | ${result.count} shown | ${result.file} (${result.total} rows)`];
  if (!result.count) {
    out.push('No match: the data has nothing for this query (not an empty value).',
      'Retry once with 2-5 narrower terms or an explicit --domain/--stack. If still empty,',
      'say no database match was found before giving general guidance.');
    if (result.note) out.push(result.note);
    if (result.suggestions?.length) out.push(`Closest known terms: ${result.suggestions.join(', ')}`);
    return out.join('\n');
  }
  const layout = layoutFor(result);
  const appliesTo = result.stack ? new Set(result.results.map((r) => `${r['Applies To']} | verified ${r['Verified At']}`)) : null;
  if (appliesTo?.size === 1) out.push(`Applies to: ${[...appliesTo][0]}`);
  result.results.forEach((row, i) => {
    const tags = layout.tags(row).filter(Boolean);
    out.push(`${i + 1}. ${layout.title(row)}${tags.length ? ` [${tags.join(', ')}]` : ''}`);
    for (const [label, key] of layout.lines) {
      if (!row[key]) continue;
      out.push(`   ${label ? `${label}: ` : ''}${clip(key, row[key], full)}`);
    }
    if (appliesTo && appliesTo.size > 1) out.push(`   Applies to: ${row['Applies To']} | verified ${row['Verified At']}`);
  });
  return out.join('\n');
}

export function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv, allowPositionals: true, options: {
        domain: { type: 'string', short: 'd' },
        stack: { type: 'string', short: 's' },
        'max-results': { type: 'string', short: 'n' },
        json: { type: 'boolean' },
        full: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (err) {
    return { code: 2, text: `${err.message}\n${USAGE}` };
  }
  const { values, positionals } = parsed;
  if (values.help || !positionals.length) return { code: values.help ? 0 : 2, text: USAGE };
  const query = positionals.join(' ');
  const maxResults = values['max-results'] === undefined ? MAX_RESULTS : Number(values['max-results']);
  if (values.domain && values.stack) return { code: 2, text: 'Use --domain or --stack, not both.' };
  const result = values.stack
    ? searchStack(query, values.stack, { maxResults })
    : search(query, { domain: values.domain ?? null, maxResults });
  const text = values.json ? JSON.stringify(result, null, 2) : formatResult(result, { full: values.full });
  return { code: result.error ? 1 : 0, text };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { code, text } = main(process.argv.slice(2));
  (code ? process.stderr : process.stdout).write(`${text}\n`);
  process.exitCode = code;
}
