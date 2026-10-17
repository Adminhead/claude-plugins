#!/usr/bin/env -S bun --no-env-file --config=/dev/null
// Docs-sync nudge for Claude Code hooks.
//
//   docs-sync-nudge.ts start  SessionStart: record HEAD for this session, prune old state.
//   docs-sync-nudge.ts edit   PostToolUse (Edit|Write|MultiEdit|NotebookEdit): record the edited path.
//   docs-sync-nudge.ts stop   Stop: once per change set, nudge Claude (non-error additionalContext)
//                             with docs that name something this session's edits removed, or that
//                             mention a file it edited.
//
// Fails open: any error, a non-git directory, or missing state prints nothing and exits 0 so a
// broken nudge never traps a session.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

const DOC_EXTS = [".md", ".mdx", ".rst", ".adoc", ".txt"];
const DOC_GLOBS = ["*.md", "*.mdx", "*.rst", "*.adoc"];
// Records of a moment, not claims about current code.
const SKIP_DOCS = [":(exclude)docs/plans", ":(exclude)docs/research", ":(exclude)docs/adr", ":(exclude).agents", ":(exclude,glob)**/CHANGELOG*"];
const NON_DOC = DOC_EXTS.map((e) => `:(exclude,glob)**/*${e}`);
const MAX_DOCS = 10;
const MAX_IDENTS = 100;
const PRUNE_DAYS = 30;
const MIN_NAME = 4; // shorter names match too much prose

type Hook = { session_id: string; cwd: string; stop_hook_active?: boolean; tool_input?: { file_path?: string; notebook_path?: string } };

function git(cwd: string, args: string[], okCodes: number[] = [0]): string {
  const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8", timeout: 20000, maxBuffer: 64 << 20 });
  if (r.error || r.status === null || !okCodes.includes(r.status)) throw new Error(r.error?.message ?? r.stderr.trim());
  return r.stdout;
}

/** Repo root, or null outside a git repo or before the first commit. */
function toplevel(cwd: string): string | null {
  const r = spawnSync("git", ["-C", cwd, "rev-parse", "--show-toplevel", "--verify", "-q", "HEAD"], { encoding: "utf8", timeout: 20000 });
  return r.status === 0 ? r.stdout.split("\n")[0] : null;
}

function stateDir(): string | null {
  const d = process.env.CLAUDE_PLUGIN_DATA;
  if (!d) return null;
  const p = join(d, "docs-sync");
  mkdirSync(p, { recursive: true });
  return p;
}

const safeId = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, "_");
const isDoc = (p: string) => DOC_EXTS.some((e) => p.toLowerCase().endsWith(e));

function prune(sdir: string) {
  const cutoff = Date.now() - PRUNE_DAYS * 86400_000;
  for (const f of readdirSync(sdir)) {
    const p = join(sdir, f);
    const s = statSync(p);
    if (s.isFile() && s.mtimeMs < cutoff) unlinkSync(p);
  }
}

function start(data: Hook) {
  const sdir = stateDir();
  const top = toplevel(data.cwd);
  if (!sdir || !top) return;
  prune(sdir);
  const headFile = join(sdir, `${safeId(data.session_id)}.head`);
  if (!existsSync(headFile)) writeFileSync(headFile, git(top, ["rev-parse", "HEAD"]).trim()); // resume and compact keep the original baseline
}

// Subagent transcripts record the parent's sessionId, so hooks are expected to carry it too (UNCONFIRMED for hooks).
function edit(data: Hook) {
  const path = data.tool_input?.file_path ?? data.tool_input?.notebook_path;
  const sdir = stateDir();
  if (!path || !sdir) return;
  appendFileSync(join(sdir, `${safeId(data.session_id)}.edited`), `${resolve(data.cwd, path)}\n`);
}

/** True when a nested repo or worktree (a `.git` below the repo top) contains the path. */
function inNestedRepo(top: string, real: string): boolean {
  for (let dir = dirname(real); dir.length > top.length && dir.startsWith(top); dir = dirname(dir)) {
    if (existsSync(join(dir, ".git"))) return true;
  }
  return false;
}

/** Repo-relative paths of this session's edits that sit inside the repo, outside nested repos and ignored paths. */
function editedPaths(sdir: string, sid: string, top: string, cwd: string): string[] {
  const file = join(sdir, `${sid}.edited`);
  if (!existsSync(file)) return [];
  const out = new Set<string>();
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    const abs = isAbsolute(line) ? line : resolve(cwd, line);
    let real = abs;
    try {
      real = realpathSync(abs);
    } catch {
      // A deleted file keeps its recorded path.
    }
    const rel = relative(top, real);
    if (rel && !rel.startsWith("..") && !isAbsolute(rel) && !inNestedRepo(top, real)) out.add(rel);
  }
  if (!out.size) return [];
  // Subagent worktrees live under the gitignored .claude/worktrees/.
  const ignored = spawnSync("git", ["-C", top, "check-ignore", "--stdin", "-z"], { input: [...out].join("\0"), encoding: "utf8", timeout: 20000 });
  if (ignored.error || (ignored.status !== 0 && ignored.status !== 1)) throw new Error(ignored.error?.message ?? ignored.stderr.trim());
  for (const p of ignored.stdout.split("\0")) out.delete(p);
  return [...out].sort();
}

const CODE_LIKE = /_|[a-z][A-Z]|^[A-Z0-9]+$|^--/;

/** Code-like identifiers on removed lines of the edited files' diff since the baseline. */
function removedIdents(top: string, base: string, files: string[]): string[] {
  const diff = git(top, ["--literal-pathspecs", "diff", "-U0", "--no-ext-diff", base, "--", ...files]);
  const found = new Set<string>();
  for (const line of diff.split("\n")) {
    if (!line.startsWith("-") || /^--- (a\/|\/dev\/null)/.test(line)) continue;
    for (const w of line.slice(1).match(/--[a-z][a-z0-9-]*|[A-Za-z_][A-Za-z0-9_]*/g) ?? []) {
      if (w.length >= MIN_NAME && CODE_LIKE.test(w)) found.add(w);
    }
  }
  return [...found].slice(0, MAX_IDENTS);
}

const patternArgs = (names: string[]) => names.flatMap((n) => ["-e", n]);

/** Names among `idents` that still appear in tracked or untracked non-doc files. */
function stillPresent(top: string, idents: string[]): Set<string> {
  const out = git(top, ["grep", "--untracked", "-h", "-o", "-w", "-F", ...patternArgs(idents), "--", ...NON_DOC], [0, 1]);
  return new Set(out.split("\n").filter(Boolean));
}

/** First `line` of each doc hit, as [doc, line, text]. */
function docHits(top: string, names: string[], word: boolean): [string, string, string][] {
  const out = git(top, ["grep", "-n", "-z", "-F", ...(word ? ["-w"] : []), ...patternArgs(names), "--", ...DOC_GLOBS, ...SKIP_DOCS], [0, 1]);
  // -z output: path NUL line NUL text NL
  const hits: [string, string, string][] = [];
  for (const m of out.matchAll(/([^\0\n]+)\0(\d+)\0([^\n]*)/g)) hits.push([m[1], m[2], m[3]]);
  return hits;
}

function stop(data: Hook) {
  if (data.stop_hook_active) return;
  const sdir = stateDir();
  const top = toplevel(data.cwd);
  if (!sdir || !top) return;
  const sid = safeId(data.session_id);
  const edited = editedPaths(sdir, sid, top, data.cwd);
  const code = edited.filter((p) => !isDoc(p));
  if (!code.length) return;
  const digest = createHash("sha256").update(code.join("\n")).digest("hex");
  const seenFile = join(sdir, `${sid}.seen`);
  if (existsSync(seenFile) && readFileSync(seenFile, "utf8").trim() === digest) return;

  const headFile = join(sdir, `${sid}.head`);
  const base = existsSync(headFile) ? readFileSync(headFile, "utf8").trim() : "HEAD";
  const editedDocs = new Set(edited.filter(isDoc));
  const seen = new Set<string>(); // one entry per doc, at its best tier
  const gone: string[] = [];
  const mentions: string[] = [];

  const idents = removedIdents(top, base, code);
  if (idents.length) {
    const present = stillPresent(top, idents);
    const missing = idents.filter((i) => !present.has(i));
    if (missing.length) {
      for (const [doc, line, text] of docHits(top, missing, true)) {
        if (editedDocs.has(doc) || seen.has(doc)) continue;
        const name = missing.find((n) => text.includes(n));
        if (!name) continue;
        seen.add(doc);
        gone.push(`${doc}:${line} → ${name}`);
      }
    }
  }

  // Full paths rank above basenames, so a generic basename never hides a specific path.
  const bases = [...new Set(code.map((p) => basename(p)))].filter((n) => n.length >= MIN_NAME);
  const names = [...new Set([...code, ...bases])];
  const hits = docHits(top, names, false);
  for (const tier of [code, bases]) {
    for (const [doc, line, text] of hits) {
      if (editedDocs.has(doc) || seen.has(doc)) continue;
      const name = tier.find((n) => text.includes(n));
      if (!name) continue;
      seen.add(doc);
      mentions.push(`${doc}:${line} → ${name}`);
    }
  }

  const room = MAX_DOCS - Math.min(gone.length, MAX_DOCS);
  const shownGone = gone.slice(0, MAX_DOCS);
  const shownMentions = mentions.slice(0, room);
  if (!shownGone.length && !shownMentions.length) return;

  writeFileSync(seenFile, digest);
  const section = (title: string, rows: string[]) => (rows.length ? `${title}\n${rows.map((r) => `- ${r}`).join("\n")}\n` : "");
  const reason =
    "This session edited code that these docs may no longer describe.\n" +
    section("Names something that no longer exists in code:", shownGone) +
    section("Mentions an edited file:", shownMentions) +
    "Check them for stale statements, or offer authoring:docs-audit.";
  // additionalContext is non-error feedback; decision: block would show as a "blocking error".
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "Stop", additionalContext: reason } }));
}

try {
  const modes: Record<string, (d: Hook) => void> = { start, edit, stop };
  const mode = modes[process.argv[2] ?? ""];
  if (!mode) throw new Error(`unknown mode "${process.argv[2] ?? ""}"`);
  mode(JSON.parse(readFileSync(0, "utf8")));
} catch (e) {
  // Fail open.
  console.error(`docs-sync-nudge: ${(e as Error).message}`);
}
process.exit(0);
