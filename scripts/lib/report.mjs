// Collects checks, transactions and AI observations, prints them live, and writes a
// Markdown + JSON report at the end.
import fs from 'node:fs';
import path from 'node:path';

const ICON = { PASS: '✔', FAIL: '✘', WARN: '⚠' };

export class Report {
  constructor(meta) {
    this.meta = meta;
    this.started = Date.now();
    this.checks = [];
    this.txs = [];
    this.notes = [];
    this.sections = [];
    this.current = 'setup';
  }

  section(title) {
    this.current = title;
    this.sections.push(title);
    console.log(`\n=== ${title} ===`);
  }

  check(name, ok, detail = '', { soft = false } = {}) {
    const status = ok ? 'PASS' : soft ? 'WARN' : 'FAIL';
    this.checks.push({ section: this.current, name, status, detail: String(detail ?? '') });
    const tail = detail ? `  — ${detail}` : '';
    console.log(`  ${ICON[status]} ${name}${status === 'PASS' ? '' : tail}`);
    return ok;
  }

  note(text) {
    this.notes.push({ section: this.current, text });
    console.log(`  · ${text}`);
  }

  tx(entry) {
    this.txs.push({ section: this.current, ...entry });
    const flag = entry.ok ? 'ok ' : (entry.kind ?? 'fail');
    console.log(`  → ${entry.label.padEnd(34)} ${String(flag).padEnd(13)} ${entry.seconds}s${entry.attempt > 1 ? `  (attempt ${entry.attempt})` : ''}`);
  }

  counts() {
    const c = { PASS: 0, FAIL: 0, WARN: 0 };
    for (const k of this.checks) c[k.status] += 1;
    return { passed: c.PASS, failed: c.FAIL, warnings: c.WARN, total: this.checks.length };
  }

  toJSON() {
    return { meta: this.meta, seconds: Math.round((Date.now() - this.started) / 1000), counts: this.counts(),
      checks: this.checks, transactions: this.txs, notes: this.notes };
  }

  toMarkdown() {
    const c = this.counts();
    const lines = [];
    lines.push(`# RATCHET live end-to-end report`, '');
    lines.push(`* mode: **${this.meta.mode}**   * network: ${this.meta.network}`);
    lines.push(`* contract: \`${this.meta.address ?? 'n/a'}\``);
    lines.push(`* source sha256: \`${this.meta.sourceSha256}\``);
    lines.push(`* started: ${new Date(this.started).toISOString()}   * duration: ${Math.round((Date.now() - this.started) / 1000)} s`);
    lines.push(`* **${c.passed} passed, ${c.failed} failed, ${c.warnings} warnings** (${c.total} checks, ${this.txs.length} transactions)`, '');
    for (const section of this.sections) {
      lines.push(`## ${section}`, '');
      for (const k of this.checks.filter((x) => x.section === section)) {
        lines.push(`- ${ICON[k.status]} ${k.name}${k.detail && k.status !== 'PASS' ? ` — ${k.detail}` : ''}`);
      }
      for (const n of this.notes.filter((x) => x.section === section)) lines.push(`- · ${n.text}`);
      const txs = this.txs.filter((x) => x.section === section);
      if (txs.length) {
        lines.push('', '| tx | result | hash | s |', '|---|---|---|---|');
        for (const t of txs) lines.push(`| ${t.label}${t.attempt > 1 ? ` (attempt ${t.attempt})` : ''} | ${t.ok ? 'ok' : t.kind} | \`${t.hash ?? ''}\` | ${t.seconds} |`);
      }
      lines.push('');
    }
    return lines.join('\n');
  }

  write(dir, stem) {
    fs.mkdirSync(dir, { recursive: true });
    const json = JSON.stringify(this.toJSON(), null, 2);
    const md = this.toMarkdown();
    fs.writeFileSync(path.join(dir, `${stem}.json`), json);
    fs.writeFileSync(path.join(dir, `${stem}.md`), md);
    fs.writeFileSync(path.join(dir, 'latest.json'), json);
    fs.writeFileSync(path.join(dir, 'latest.md'), md);
    return path.join(dir, `${stem}.md`);
  }
}
