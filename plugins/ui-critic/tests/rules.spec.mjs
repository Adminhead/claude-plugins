// Specs for scripts/lib/rules.mjs (pure logic). Run: node --test plugins/ui-critic/tests/
// The fixture is real probe() output for a small local page at 1440px, captured with inspect.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { judge, colourFamily, RULE_IDS } from '../scripts/lib/rules.mjs';

const base = () => JSON.parse(readFileSync(new URL('./fixtures/metrics-1440.json', import.meta.url), 'utf8'));
const level = (findings, id) => findings.find((f) => f.id === id)?.level;

test('fixture page: the eyebrow fails and the picture quota only warns', () => {
  const f = judge(base(), { width: 1440 });
  assert.equal(level(f, 'eyebrow'), 'FAIL');
  assert.equal(level(f, 'few-pictures'), 'WARN');
  assert.equal(level(f, 'numbering'), 'WARN');
});

test('owner-taste rules report WARN, never FAIL', () => {
  const m = base();
  m.type.monoProseShare = 0.1; m.type.monoFamilies = ['Space Mono']; m.type.monoSamples = ['v1.2'];
  m.numbered = [{ text: '01' }, { text: '02' }, { text: '03' }];
  m.surfaces.hairlines = 6; m.surfaces.hairlineSamples = ['div 1px'];
  m.surfaces.outlinedBoxes = 5;
  const f = judge(m, { width: 1440 });
  for (const id of ['mono', 'numbering', 'hairline', 'outlined-box']) assert.equal(level(f, id), 'WARN', id);
});

test('defects still fail: long headline, overflow, unreadable contrast, gradient text', () => {
  const m = base();
  m.headings = [{ text: 'A headline that runs on and on', lines: 3, words: 7, size: 80, kind: 'heading' }];
  m.page.horizontalOverflow = 40; m.page.overflowCulprits = ['div.wide'];
  m.color.lowContrast = [{ text: 'faint', ratio: 1.8, need: 4.5, fg: '#ccc', bg: '#ddd' }];
  m.surfaces.gradientText = 1;
  const f = judge(m, { width: 1440 });
  for (const id of ['headline-lines', 'overflow', 'contrast', 'gradient-text']) assert.equal(level(f, id), 'FAIL', id);
});

test('--allow removes a rule entirely (the brief wins)', () => {
  const f = judge(base(), { width: 1440, allow: ['eyebrow'] });
  assert.equal(level(f, 'eyebrow'), undefined);
});

test('assistant palette: cream plus terracotta fails, cream alone warns', () => {
  assert.equal(colourFamily({ h: 40, s: 0.4, l: 0.94 }), 'cream');
  assert.equal(colourFamily({ h: 15, s: 0.6, l: 0.6 }), 'terracotta');
  const m = base();
  m.color.bodyBg = '#f4f1ea'; m.color.bodyBgHsl = { h: 43, s: 0.3, l: 0.94 };
  assert.equal(level(judge(m, { width: 1440 }), 'palette-cream'), 'WARN');
  m.color.button = { bg: '#d97757', hsl: { h: 15, s: 0.62, l: 0.6 } };
  assert.equal(level(judge(m, { width: 1440 }), 'palette-claude'), 'FAIL');
});

test('every emitted id is a known rule id', () => {
  const m = base();
  m.type.monoProseShare = 0.1; m.surfaces.hairlines = 3; m.page.horizontalOverflow = 10;
  for (const f of judge(m, { width: 1440 })) assert.ok(RULE_IDS.includes(f.id), f.id);
});
