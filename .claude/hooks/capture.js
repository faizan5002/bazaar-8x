#!/usr/bin/env node
// Agent capture hook for the 8x assignment.
//
// Wired to SessionStart, UserPromptSubmit and Stop in .claude/settings.json.
// Writes ONLY the prompt and the final response of each turn (plus UTC
// timestamp and model) to .agent-logs/<date>_<time>_<session-id>.md.
// No thinking, no tool calls, no intermediate text.
//
// Design: the log file is the state. Every run re-derives the list of turns
// from the session transcript and appends whatever the log is missing, so a
// hook that was skipped (or installed late) is repaired by the next one.
//
//   node capture.js                       hook mode, JSON payload on stdin
//   node capture.js reconcile <transcript.jsonl>   manual repair, complete turns only

const fs = require('fs');
const os = require('os');
const path = require('path');

const PROJECT_DIR = path.resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());
const LOG_DIR = path.join(PROJECT_DIR, '.agent-logs');
const ERR_LOG = path.join(LOG_DIR, 'capture-errors.log');

// ---------- transcript parsing ----------

function readJsonl(file) {
  const out = [];
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return out; }
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* partial line mid-write */ }
  }
  return out;
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter(b => b && b.type === 'text' && typeof b.text === 'string').map(b => b.text).join('\n');
}

const hasToolResult = c => Array.isArray(c) && c.some(b => b && b.type === 'tool_result');

// A real prompt: top-level, non-meta user entry carrying text and no tool_result.
function isPrompt(e) {
  return e.type === 'user' && !e.isSidechain && !e.isMeta && !e.isCompactSummary &&
    e.message && !hasToolResult(e.message.content) && textOf(e.message.content).length > 0;
}

// -> [{ prompt, promptTs, response|null, responseTs, model }]
function parseTurns(entries) {
  const turns = [];
  let cur = null;
  const flush = () => { if (cur) turns.push(cur); };
  for (const e of entries) {
    if (e.isSidechain) continue;
    if (isPrompt(e)) {
      flush();
      cur = { prompt: textOf(e.message.content), promptTs: e.timestamp, trailing: [], responseTs: null, model: null };
    } else if (!cur) {
      continue;
    } else if (e.type === 'user') {
      cur.trailing = []; // tool result / injected context: anything before it was intermediate
    } else if (e.type === 'assistant' && e.message) {
      if (e.message.model && e.message.model !== '<synthetic>') cur.model = e.message.model;
      const t = textOf(e.message.content);
      if (t) { cur.trailing.push(t); cur.responseTs = e.timestamp; }
    }
  }
  flush();
  for (const t of turns) { t.response = t.trailing.length ? t.trailing.join('\n\n') : null; delete t.trailing; }
  // Turns with no response that are not the last one are local commands (/hooks etc.).
  return turns.filter((t, i) => t.response !== null || i === turns.length - 1);
}

function lastModel(entries) {
  for (let i = entries.length - 1; i >= 0; i--) {
    const m = entries[i].message && entries[i].message.model;
    if (entries[i].type === 'assistant' && m && m !== '<synthetic>') return m;
  }
  return null;
}

// ---------- log file ----------

const short = sid => sid.slice(0, 8);

function findLogFile(sid) {
  if (!fs.existsSync(LOG_DIR)) return null;
  const f = fs.readdirSync(LOG_DIR).find(n => n.endsWith(`_${sid}.md`));
  return f ? path.join(LOG_DIR, f) : null;
}

function author() {
  return process.env.AGENT_LOG_AUTHOR || 'faizan5002';
}

function entryRe(type, sid) {
  return new RegExp(`^\\[LOG_ENTRY type=${type} num=(\\d+) session=${short(sid)}\\]$`, 'gm');
}
function countEntries(body, type, sid) { return [...body.matchAll(entryRe(type, sid))].length; }

function header(sid, firstTs, lastTs, model, total) {
  return [
    '---',
    `session_id: ${sid}`,
    `date: ${firstTs.slice(0, 10)}`,
    `author: ${author()}`,
    `model: ${model}`,
    'tool: claude-code',
    `project: ${path.basename(PROJECT_DIR)}`,
    `total_exchanges: ${total}`,
    `first_prompt_time: ${firstTs}`,
    `last_prompt_time: ${lastTs}`,
    '---',
    '',
    `# Session Log - ${firstTs.slice(0, 10)}`,
    '',
    `Session: \`${short(sid)}\` | Project: \`${path.basename(PROJECT_DIR)}\` | Author: \`${author()}\``,
    '',
    '---',
    '',
    '',
  ].join('\n');
}

function entry(type, num, sid, ts, model, text) {
  return `[LOG_ENTRY type=${type} num=${num} session=${short(sid)}]\ntimestamp: ${ts}\nmodel: ${model}\n\n${text}\n\n\n`;
}

// Append entries; create the file on first write; refresh only the derived
// front matter (counts / last_prompt_time / model). Entries are never rewritten.
function append(sid, items) {
  if (!items.length) return;
  fs.mkdirSync(LOG_DIR, { recursive: true });
  let file = findLogFile(sid);
  let body = '';
  let firstTs;
  if (file) {
    const txt = fs.readFileSync(file, 'utf8');
    const at = txt.indexOf('[LOG_ENTRY');
    body = at >= 0 ? txt.slice(at) : '';
    firstTs = (txt.match(/^first_prompt_time: (.+)$/m) || [])[1];
  }
  const firstPrompt = items.find(i => i.type === 'PROMPT');
  if (!firstTs) firstTs = (firstPrompt || items[0]).ts;
  if (!file) {
    const stamp = firstTs.replace(/\.\d+Z$/, '').replace('T', '_').replace(/:/g, '-');
    file = path.join(LOG_DIR, `${stamp}_${sid}.md`);
  }
  body += items.map(i => entry(i.type, i.num, sid, i.ts, i.model, i.text)).join('');
  const prompts = [...body.matchAll(entryRe('PROMPT', sid))].length;
  const lastPromptTs = items.filter(i => i.type === 'PROMPT').map(i => i.ts).pop() ||
    (() => { const m = [...body.matchAll(/^\[LOG_ENTRY type=PROMPT[^\n]*\]\ntimestamp: (.+)$/gm)]; return m.length ? m[m.length - 1][1] : firstTs; })();
  const lastModelSeen = items[items.length - 1].model;
  fs.writeFileSync(file, header(sid, firstTs, lastPromptTs, lastModelSeen, prompts) + body, 'utf8');
}

// Append whatever turns are missing from the log. `includeInflight` lets the
// caller handle the last turn itself (it has the live prompt / last message).
function reconcile(sid, transcriptPath, { includeLastTurn, lastMessage, fallbackModel, pending }) {
  const entries = readJsonl(transcriptPath);
  const turns = parseTurns(entries);
  const file = findLogFile(sid);
  const body = file ? fs.readFileSync(file, 'utf8') : '';
  let P = countEntries(body, 'PROMPT', sid);
  let R = countEntries(body, 'RESPONSE', sid);
  const items = [];
  const model = lastModel(entries) || fallbackModel || 'unknown';
  turns.forEach((t, idx) => {
    const num = idx + 1;
    const isLast = idx === turns.length - 1;
    let response = t.response;
    if (isLast && !includeLastTurn && response === null) return; // in flight
    if (isLast && lastMessage) response = lastMessage;
    if (num > P) {
      // A prompt held back at submit time (model not yet known) keeps its live text and timestamp.
      const held = isLast && pending ? pending : null;
      items.push({ type: 'PROMPT', num, ts: held ? held.ts : t.promptTs, model: t.model || model, text: held ? held.text : t.prompt });
      P = num;
    }
    if (response !== null && num > R) {
      items.push({ type: 'RESPONSE', num, ts: t.responseTs || new Date().toISOString(), model: t.model || model, text: response });
      R = num;
    }
  });
  append(sid, items);
}

// ---------- entry points ----------

function sessionIdFromPath(p) { return path.basename(p, '.jsonl'); }

function onHook(p) {
  const sid = p.session_id;
  const tp = p.transcript_path;
  if (!sid || !tp) return;
  const ev = p.hook_event_name;

  if (ev === 'SessionStart') {
    // Self-heal: repair any other (idle) session of this project whose log is behind.
    const dir = path.dirname(tp);
    for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.jsonl'))) {
      const other = sessionIdFromPath(f);
      if (other === sid) continue;
      if (Date.now() - fs.statSync(path.join(dir, f)).mtimeMs < 60000) continue; // probably live
      reconcile(other, path.join(dir, f), { includeLastTurn: false });
    }
    if (p.model) { try { fs.writeFileSync(path.join(os.tmpdir(), `8x-capture-${sid}.model`), p.model); } catch {} }
    return;
  }

  let fallbackModel = p.model;
  if (!fallbackModel) { try { fallbackModel = fs.readFileSync(path.join(os.tmpdir(), `8x-capture-${sid}.model`), 'utf8'); } catch {} }

  const pendingFile = path.join(os.tmpdir(), `8x-capture-${sid}.pending.json`);
  const readPending = () => { try { return JSON.parse(fs.readFileSync(pendingFile, 'utf8')); } catch { return null; } };
  const nextNum = () => {
    const f = findLogFile(sid);
    return countEntries(f ? fs.readFileSync(f, 'utf8') : '', 'PROMPT', sid) + 1;
  };

  if (ev === 'UserPromptSubmit') {
    // 1) repair earlier completed turns, 2) flush a prompt whose Stop never fired,
    // 3) log this prompt from the live payload.
    reconcile(sid, tp, { includeLastTurn: false, fallbackModel });
    const stale = readPending();
    if (stale) {
      append(sid, [{ type: 'PROMPT', num: nextNum(), ts: stale.ts, model: lastModel(readJsonl(tp)) || fallbackModel || 'unknown', text: stale.text }]);
      try { fs.unlinkSync(pendingFile); } catch {}
    }
    const model = lastModel(readJsonl(tp)) || fallbackModel;
    const live = { ts: new Date().toISOString(), text: p.prompt };
    if (model) append(sid, [{ type: 'PROMPT', num: nextNum(), ts: live.ts, model, text: live.text }]);
    // First prompt of a session: no assistant message yet, so the model is unknown.
    // Hold the prompt; Stop writes it together with the response and the real model.
    else fs.writeFileSync(pendingFile, JSON.stringify(live));
    return;
  }

  if (ev === 'Stop') {
    // The transcript can lag the Stop hook by a moment; wait briefly for the model to show up.
    for (let i = 0; i < 12; i++) {
      const turns = parseTurns(readJsonl(tp));
      if (turns.length && turns[turns.length - 1].model) break;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
    reconcile(sid, tp, { includeLastTurn: true, lastMessage: p.last_assistant_message, fallbackModel, pending: readPending() });
    try { fs.unlinkSync(pendingFile); } catch {}
  }
}

function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === 'reconcile' && argv[1]) {
    reconcile(sessionIdFromPath(argv[1]), argv[1], { includeLastTurn: false });
    return;
  }
  let raw = '';
  try { raw = fs.readFileSync(0, 'utf8'); } catch {}
  let payload;
  try { payload = JSON.parse(raw); } catch { return; }
  try {
    // Keys only (no content) so the hook payload shape can be audited without leaking prompts.
    fs.appendFileSync(path.join(os.tmpdir(), '8x-capture-payload-keys.log'),
      `${new Date().toISOString()} ${payload.hook_event_name} ${Object.keys(payload).join(',')}\n`);
  } catch {}
  onHook(payload);
}

try { main(); } catch (err) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(ERR_LOG, `${new Date().toISOString()} ${err && err.stack || err}\n`);
  } catch {}
}
process.exit(0);
