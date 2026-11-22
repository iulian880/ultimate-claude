// Offline grader for a fresh, single-prompt Claude Code --output-format stream-json capture.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { isMain } from '../plugins/uc-core/hooks/lib/hook-io.mjs';

export const cases = JSON.parse(fs.readFileSync(new URL('../evals/component-routing.json', import.meta.url)));
function component(call) {
  if (call.name === 'Skill') return call.input?.skill?.replace(/^planning-with-files:planning-with-files$/, 'planning-with-files');
  if (['Agent','Task'].includes(call.name)) return call.input?.subagent_type;
  if (/^mcp__[^/]*context7[^/]*__resolve-library-id$/i.test(call.name)) return 'context7-resolve';
  if (['Bash','PowerShell'].includes(call.name) && /^(?:rtk bypass\s+)?ctx7\s+library\s+/m.test(call.input?.command ?? '')) return 'context7-resolve';
  if (/^mcp__[^/]*context7[^/]*__(query-docs|get-library-docs)$/i.test(call.name)) return 'context7-docs';
  if (['Bash', 'PowerShell'].includes(call.name) && /^(?:rtk bypass\s+)?ctx7\s+docs\s+/m.test(call.input?.command ?? '')) return 'context7-docs';
}

export function grade(scenario, raw, review) {
  const events = raw.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const terminal = events.at(-1);
  const init = events.find(event => event.type === 'system' && event.subtype === 'init');
  const pluginLoaded = init?.plugins?.some(plugin => plugin.name === 'uc-core') === true;
  const complete = pluginLoaded && terminal?.type === 'result' && terminal.subtype === 'success' && terminal.is_error === false;
  const calls = new Map();
  for (const event of events) {
    if (event.type !== 'assistant') continue;
    for (const call of event.message?.content ?? []) {
      if (call.type === 'tool_use' && call.id) calls.set(call.id, component(call));
    }
  }
  const observed = [...new Set([...calls.values()].filter(Boolean))];
  const unnecessary = scenario.avoid.filter(x => observed.includes(x));
  const selected = !scenario.anyOf.length || scenario.anyOf.some(x => observed.includes(x));
  const digest = createHash('sha256').update(raw).digest('hex');
  if (review && (review.id !== scenario.id || review.sha256 !== digest ||
      !['pass','fail'].includes(review.outcome) || !['pass','fail'].includes(review.timing) ||
      !review.evidence?.trim())) throw Error('Review must identify this case and capture, grade timing and outcome, and cite evidence');
  const routing = complete ? (selected && !unnecessary.length ? 'pass' : 'fail') : 'incomplete';
  const outcome = complete ? review?.outcome ?? 'ungraded' : 'incomplete';
  const timing = complete ? review?.timing ?? 'ungraded' : 'incomplete';
  return { id: scenario.id, sha256: digest, pluginLoaded, observed, unnecessary, routing, timing, outcome,
    criterion: scenario.criterion, evidence: review?.evidence, pass: [routing,timing,outcome].every(x => x === 'pass') };
}

if (isMain(import.meta.url)) {
  const [id, file, reviewFile] = process.argv.slice(2);
  const scenario = cases.find(item => item.id === id);
  if (!scenario) throw Error('Choose case: ' + cases.map(item => item.id).join(', '));
  if (!file) console.log(scenario.prompt);
  else {
    const review = reviewFile && JSON.parse(fs.readFileSync(reviewFile, 'utf8'));
    const result = grade(scenario, fs.readFileSync(file, 'utf8'), review);
    console.log(JSON.stringify(result, null, 2));
    if (!result.pass) process.exitCode = 1;
  }
}
