import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cases, grade } from '../scripts/grade-routing.mjs';
import { handle } from '../plugins/uc-core/hooks/session-start.mjs';

const capture = (calls, complete = true) => [
  { type: 'system', subtype: 'init', plugins: [{name:'uc-core'}] },
  { type: 'assistant', message: { content: calls.map(([name,input],i) => ({ type:'tool_use', id:String(i), name,input })) } },
  { type: 'result', subtype: complete ? 'success' : 'error_during_execution', is_error: !complete },
].map(value => JSON.stringify(value)).join('\n');
const skill = skill => ['Skill', { skill }];
const api = cases.find(x => x.id === 'api');
const simple = cases.find(x => x.id === 'simple');

test('session-start delivers the published routing rules on every valid startup', () => {
  const expected = fs.readFileSync(new URL('../plugins/uc-core/component-routing.md',import.meta.url),'utf8');
  for (const source of ['startup','resume','compact','clear']) {
    const output = JSON.parse(handle({ cwd:process.cwd(), source }).stdout).hookSpecificOutput;
    assert.deepEqual(output,{ hookEventName:'SessionStart', additionalContext:expected });
  }
});
test('documentation retrieval requires an observed lookup, accepts MCP and CLI', () => {
  for (const call of [['Bash',{command:'ctx7 docs /example/library query'}], ['mcp__claude_ai_Context7__query-docs',{}]]) {
    const raw = capture([call]);
    const result = grade(api,raw);
    assert.equal(result.routing,'pass');
    assert.equal(result.pass,false);
    const review = {id:'api',sha256:result.sha256,timing:'pass',outcome:'pass',evidence:'Reviewed source, version and timing'};
    assert.equal(grade(api,raw,review).pass,true);
    assert.equal(grade(api,raw,{...review,outcome:'fail'}).pass,false);
    assert.throws(() => grade(api,raw,{...review,sha256:'another run'}));
  }
  assert.equal(grade(api,capture([skill('find-docs')])).routing,'fail');
  assert.equal(grade(api,capture([['Bash',{command:'echo ctx7 docs'}]])).routing,'fail');
});
test('unnecessary triggers and incomplete runs cannot pass', () => {
  assert.equal(grade(simple,capture([])).routing,'pass');
  assert.deepEqual(grade(simple,capture([skill('planning-with-files')])).unnecessary,['planning-with-files']);
  assert.equal(grade(simple,capture([skill('planning-with-files')])).routing,'fail');
  assert.equal(grade(simple,capture([],false)).routing,'incomplete');
  assert.equal(grade(simple,'').pass,false);
  assert.equal(grade(simple,capture([]).replace('uc-core','other-plugin')).routing,'incomplete');
});

test('a direct answer rejects unexpected specialists but allows ordinary tools', () => {
  for (const call of [skill('accessibility-engineering'), ['Agent',{subagent_type:'Explore'}]]) {
    assert.equal(grade(simple,capture([call])).routing,'fail');
  }
  assert.equal(grade(simple,capture([['Read',{file_path:'README.md'}]])).routing,'pass');
});

test('recognizes the approved workbook skill under both installed names', () => {
  const xlsx = cases.find(item => item.id === 'xlsx');
  const vba = cases.find(item => item.id === 'vba');
  for (const name of ['xlsx','anthropic-skills:xlsx']) {
    assert.equal(grade(xlsx,capture([skill(name)])).routing,'pass');
    assert.equal(grade(vba,capture([skill(name)])).routing,'fail');
  }
  assert.equal(grade(xlsx,capture([skill('unrelated:xlsx')])).routing,'fail');
});

test('identical requests expect opposite discovery decisions when project capabilities differ', () => {
  const gap = cases.find(item => item.id === 'discovery-gap');
  const local = cases.find(item => item.id === 'discovery-local');
  assert.equal(gap.prompt,local.prompt);
  for (const [scenario,withSkill,withoutSkill] of [[gap,'pass','fail'],[local,'fail','pass']]) {
    assert.equal(grade(scenario,capture([skill('uc-core:product-discovery')])).routing,withSkill);
    assert.equal(grade(scenario,capture([])).routing,withoutSkill);
  }
});
