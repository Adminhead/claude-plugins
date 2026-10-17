// Specs for the uiux-lookup search port. Run: node --test plugins/uiux-lookup/tests/
// (or bun test plugins/uiux-lookup). Cases follow ui-ux-pro-max's own Python tests
// for the domains and stacks this skill keeps.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  BM25, DATA_DIR, DOMAINS, STACKS, detectDomain, parseCsv, search, searchStack, similarity, tokenize,
} from '../skills/uiux-lookup/scripts/core.mjs';
import { formatResult, main } from '../skills/uiux-lookup/scripts/search.mjs';

test('tokenizer keeps short domain terms and drops stopwords', () => {
  const tokens = tokenize('UI and UX design with 3D and AI');
  for (const t of ['ui', 'ux', '3d', 'ai']) assert.ok(tokens.includes(t), t);
  const stop = tokenize('this is for the team to do');
  for (const t of ['is', 'for', 'the', 'to', 'do']) assert.ok(!stop.includes(t), t);
});

test('synonyms normalize at word boundaries only', () => {
  assert.deepEqual(tokenize('e-commerce store'), tokenize('ecommerce store'));
  assert.deepEqual(tokenize('dark-mode toggle'), tokenize('dark toggle'));
  const nav = tokenize('nav navigation navbar');
  assert.ok(nav.includes('navigation') && nav.includes('navbar'));
  assert.ok(!nav.includes('navigationigation') && !nav.includes('navigationbar'));
  const uk = tokenize('colour, organisation; behaviour customisation');
  for (const t of ['color', 'organization', 'behavior', 'customization']) assert.ok(uk.includes(t), t);
});

test('empty BM25 index scores nothing', () => {
  const index = new BM25().fit([]);
  assert.deepEqual(index.score('anything'), []);
  assert.deepEqual(index.vocabulary(), []);
});

test('similarity matches difflib ratio', () => {
  assert.equal(similarity('abcd', 'bcde'), 0.75);
  assert.equal(similarity('testimonal', 'testimonials'), 20 / 22);
  assert.equal(similarity('abc', 'xyz'), 0);
});

test('csv parser handles quotes, doubled quotes and CRLF', () => {
  const rows = parseCsv('﻿a,b\r\n1,"x, ""y"""\r\n2,"multi\nline"\n');
  assert.deepEqual(rows, [{ a: '1', b: 'x, "y"' }, { a: '2', b: 'multi\nline' }]);
});

test('every kept data file exists and parses', () => {
  for (const d of Object.keys(DOMAINS)) assert.ok(!search('performance', { domain: d }).error, d);
  for (const s of STACKS) {
    assert.ok(existsSync(join(DATA_DIR, 'stacks', `${s}.csv`)), s);
    assert.ok(!searchStack('performance', s, { maxResults: 1 }).error, s);
  }
  assert.ok(existsSync(join(DATA_DIR, 'google-font-licenses.json')));
  assert.ok(existsSync(join(DATA_DIR, 'provenance.json')));
});

test('dropped aesthetic domains are gone', () => {
  for (const d of ['style', 'color', 'typography', 'product', 'landing', 'chart', 'gsap', 'react']) {
    assert.match(search('x', { domain: d }).error, /Unknown domain/, d);
  }
});

test('domain routing', () => {
  assert.equal(detectDomain('accessibility contrast wcag'), 'ux');
  assert.equal(detectDomain('lucide search icon outline'), 'icons');
  assert.equal(detectDomain('drag reorder react native'), 'app');
  assert.equal(detectDomain('serif font for body text'), 'fonts');
  assert.equal(detectDomain('...!!!???'), 'ux');
  assert.equal(detectDomain('focus not obscured'), 'ux');
  assert.equal(detectDomain('safe areas on iOS'), 'app');
  assert.equal(search('Roboto Flex').domain, 'fonts');
  assert.equal(search('x', { domain: 'web' }).domain, 'app');
  assert.equal(search('x', { domain: 'google-fonts' }).domain, 'fonts');
});

test('ux search hits and zero-result path suggests instead of erroring', () => {
  assert.ok(search('accessibility contrast wcag keyboard', { domain: 'ux' }).count > 0);
  const none = search('zzqqxx totally made up gibberish', { domain: 'ux', maxResults: 2 });
  assert.equal(none.count, 0);
  assert.ok(Array.isArray(none.suggestions));
  assert.equal(none.error, undefined);
});

test('hard negative abstains across domains and stacks', () => {
  const q = 'sourdough starter crumb fermentation';
  for (const d of Object.keys(DOMAINS)) assert.equal(search(q, { domain: d, maxResults: 1 }).count, 0, d);
  for (const s of STACKS) assert.equal(searchStack(q, s, { maxResults: 1 }).count, 0, s);
});

test('text layout queries return the canonical rule first', () => {
  const cases = [
    ['orphan heading line balance', 'Heading Line Balance'],
    ['long url token breaks layout', 'Long Token Wrapping'],
    ['badge chip label wraps to second line', 'Compact Label Overflow'],
    ['filter chip collection reflow hidden values', 'Chip Collection Reflow'],
    ['live badge count screen reader', 'Contextual Live Badge Updates'],
    ['rapid chip animation interrupted', 'Cancellable State Transitions'],
  ];
  for (const [q, expected] of cases) assert.equal(search(q, { domain: 'ux' }).results[0]?.Issue, expected, q);
  assert.equal(searchStack('chip badge overflow nowrap', 'html-tailwind').results[0]?.Guideline, 'Compact label layout');
});

test('icons refuse an unsupported library and return import code', () => {
  const lucide = search('lucide icon', { diagnostics: true });
  assert.equal(lucide.domain, 'icons');
  assert.equal(lucide.count, 0);
  assert.equal(lucide.diagnostics.reason, 'unsupported-library');
  const close = search('close dismiss', { domain: 'icons', maxResults: 1 });
  assert.match(close.results[0]['Import Code'], /@phosphor-icons/);
});

test('font lookups carry the licence', () => {
  const r = search('Inter', { domain: 'fonts' });
  assert.equal(r.results[0].Family, 'Inter');
  assert.equal(r.results[0].License, 'OFL');
});

test('legacy and current stack lanes', () => {
  const current = searchStack('Svelte state props and events', 'svelte');
  const legacy = searchStack('Svelte 4 legacy props and events', 'svelte');
  assert.deepEqual(new Set(current.results.map((r) => r.Status)), new Set(['active']));
  assert.deepEqual(new Set(legacy.results.map((r) => r.Status)), new Set(['deprecated']));
  for (const [stack, q] of [['nextjs', 'Next.js 15 middleware auth matcher'], ['html-tailwind', 'tailwindcss@3 JIT'],
    ['nuxtjs', 'nuxt@3 app config'], ['nextjs', 'Next.js (v15) middleware'], ['svelte', 'svelte@4 props events']]) {
    const r = searchStack(q, stack);
    assert.ok(r.count > 0, q);
    assert.deepEqual(new Set(r.results.map((x) => x.Status)), new Set(['deprecated']), q);
  }
  const migrate = searchStack('Next.js 16 migration to proxy', 'nextjs');
  assert.deepEqual(new Set(migrate.results.map((r) => r.Status)), new Set(['active']));
  assert.equal(searchStack('Astro 5 content collections', 'astro').count, 0);
});

test('old versions without curated rows abstain', () => {
  const cases = {
    'react-native': 'React Native 0.75 Hermes', flutter: 'Flutter SDK 3.22 back navigation',
    swiftui: 'iOS 15 SwiftUI navigation', avalonia: 'Avalonia UI v11 storage picker',
    winui: 'WinUI SDK 2 desktop app', javafx: 'JavaFX SDK 21 table view',
    threejs: 'Three.js r128 OrbitControls', laravel: 'Laravel 12 validation',
  };
  for (const [stack, q] of Object.entries(cases)) assert.equal(searchStack(q, stack).count, 0, q);
});

test('native and desktop contracts', () => {
  const cases = [
    ['react-native', 'Hermes bundled default engine', 'hermes'],
    ['flutter', 'predictive back result callback', 'onpopinvokedwithresult'],
    ['flutter', 'accessible nonlinear text scaling', 'textscaler'],
    ['swiftui', 'multicolumn navigation sidebar detail', 'navigationsplitview'],
  ];
  for (const [stack, q, expected] of cases) {
    const r = searchStack(q, stack, { maxResults: 1 });
    assert.equal(r.count, 1, q);
    const text = ['Guideline', 'Do', 'Code Good'].map((f) => r.results[0][f]).join(' ').toLowerCase();
    assert.ok(text.includes(expected), q);
  }
  const winui = searchStack('new Windows desktop app Windows App SDK', 'winui');
  assert.deepEqual(new Set(winui.results.map((r) => r.Status)), new Set(['active']));
  const uwp = searchStack('UWP maintenance x:Bind migration', 'uwp');
  assert.deepEqual(new Set(uwp.results.map((r) => r.Status)), new Set(['deprecated']));
  const successor = searchStack('which Windows UI framework should a brand new app choose instead of legacy UWP', 'uwp', { maxResults: 1 });
  assert.equal(successor.results[0].Guideline, 'Prefer WinUI 3 for new projects');
});

test('migration intent returns current rows; identifiers resolve exactly', () => {
  for (const [stack, q] of [['flutter', 'replace deprecated WillPopScope with current Flutter API'],
    ['react-native', 'upgrade legacy Hermes configuration'],
    ['threejs', 'replace deprecated outputEncoding with current color space'],
    ['react-native', 'upgrade React Native 0.75 to React Native 0.86 Hermes'],
    ['flutter', 'upgrade Flutter 3.22 to Flutter 3.44 predictive back'],
    ['threejs', 'upgrade Three.js r128 to r185 outputColorSpace']]) {
    const r = searchStack(q, stack);
    assert.ok(r.count > 0, q);
    assert.deepEqual(new Set(r.results.map((x) => x.Status)), new Set(['active']), q);
  }
  for (const [stack, q, g] of [['flutter', 'onPopInvokedWithResult', 'popscope'], ['flutter', 'TextScaler', 'large fonts'],
    ['threejs', 'outputColorSpace', 'color space'], ['threejs', 'outputEncoding', 'color space']]) {
    const r = searchStack(q, stack, { maxResults: 1 });
    assert.equal(r.count, 1, q);
    assert.ok(r.results[0].Guideline.toLowerCase().includes(g), q);
  }
});

test('shadcn base filter and stack aliases', () => {
  const r = searchStack('shadcn Base UI asChild composition', 'shadcn');
  assert.equal(r.results[0].Guideline, 'Use render for Base UI composition');
  assert.ok(r.results.every((x) => !x['Applies To'].includes('base=radix')));
  assert.equal(searchStack('state hoisting', 'compose').stack, 'jetpack-compose');
  assert.match(searchStack('x', 'gtk').error, /Unknown stack/);
});

test('query length is bounded', () => {
  const r = search(`focus ${'x'.repeat(5000)}`, { domain: 'ux' });
  assert.ok(r.query.length <= 300);
});

test('CLI output is compact and honest about misses', () => {
  const hit = main(['form error placement', '--domain', 'ux', '-n', '2']);
  assert.equal(hit.code, 0);
  assert.match(hit.text, /^ux \| "form error placement" \| 2 shown/);
  assert.ok(!hit.text.includes('**'));
  const miss = main(['sourdough starter', '--stack', 'wpf']);
  assert.match(miss.text, /No match/);
  assert.equal(main(['x', '-n', '99']).code, 1);
  assert.equal(main(['x', '--domain', 'ux', '--stack', 'wpf']).code, 2);
  assert.equal(main([]).code, 2);
  const json = JSON.parse(main(['Inter', '--json']).text);
  assert.equal(json.results[0].License, 'OFL');
  assert.equal(formatResult({ error: 'boom' }), 'Error: boom');
});
