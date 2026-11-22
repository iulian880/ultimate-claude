// Offline preparation only. This script never starts Claude or calls an API.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const target = process.argv[2];
if (!target) throw Error('Usage: node scripts/prepare-pilot.mjs NEW_DIRECTORY');
const output = path.resolve(target);
fs.mkdirSync(output); // refuse to overwrite a previous pilot
const suites = {
  regression: {
    source: 'export const limit = (saved, fallback) => saved || fallback;\n',
    prompt: 'Preserve each supplied numeric retry limit, including zero. Use the fallback only for null or undefined. Add and run a regression test. Keep the public API.',
    grade: 'Check that zero, positive, negative, null and undefined behave per contract. Run the submitted test against original and final source. Record false positives and unnecessary edits.',
    hidden: "import assert from 'node:assert/strict'; import {limit} from './subject.mjs'; for (const x of [0,1,-1,null,undefined]) assert.equal(limit(x,7), x ?? 7);",
  },
  review: {
    source: 'export const exportIds = rows => [...new Set(rows.map(row => row.id))];\nexport const labels = rows => rows.map(row => row.label ?? "");\n',
    prompt: 'Review these functions against the contract. exportIds preserves order and duplicate IDs. labels preserves an empty label and represents missing labels as empty strings. Give a verdict, concrete example and missing test. Leave the code intact.',
    grade: 'BLOCK for lost duplicates (one real defect), concrete repeated-ID example and relevant test. Count every invented issue, including claims about labels, as a false positive. Verify no product edits.',
  },
};
const seed = fs.mkdtempSync(path.join(os.tmpdir(), 'uc-pilot-seed-'));
const plan = [];
try {
  for (const [name, task] of Object.entries(suites)) {
    const repo = path.join(seed,name);
    fs.mkdirSync(repo);
    fs.writeFileSync(path.join(repo,'subject.mjs'),task.source);
    const git = (...args) => execFileSync('git',args,{cwd:repo,stdio:'pipe'});
    git('init','-q'); git('add','subject.mjs');
    git('-c','user.name=Pilot','-c','user.email=pilot@example.invalid','commit','-qm','fixture');
    const commit = execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim();
    fs.writeFileSync(path.join(output,name+'-rubric.txt'),task.grade+'\n');
    if (task.hidden) fs.writeFileSync(path.join(output,name+'-hidden.mjs'),task.hidden+'\n');
    for (let repeat=0; repeat<2; repeat++) {
      const arms = repeat ? ['UC','baseline'] : ['baseline','UC'];
      for (const arm of arms) {
        const id = randomUUID();
        const cwd = path.join(output,id,'project');
        fs.mkdirSync(path.dirname(cwd),{recursive:true});
        execFileSync('git',['clone','-q','--no-local',repo,cwd]);
        execFileSync('git',['remote','remove','origin'],{cwd});
        const configDir = path.join(output,id,'config');
        fs.mkdirSync(configDir);
        const pluginArgs = ['--plugin-dir','<SUPERPOWERS>'];
        if (arm === 'UC') pluginArgs.push('--plugin-dir','<SECURITY_GUIDANCE>','--plugin-dir',path.join(root,'plugins/uc-core'));
        plan.push({id,task:name,repeat:repeat+1,arm,commit,cwd,
          env:{CLAUDE_CONFIG_DIR:configDir,UC_PROFILE:'standard',ENABLE_CODE_SECURITY_REVIEW:'0'},
          argv:['claude','-p','--model','<PINNED_MODEL>','--effort','medium','--setting-sources','project',
            '--strict-mcp-config','--no-session-persistence','--output-format','json',...pluginArgs,task.prompt]});
      }
    }
  }
  fs.writeFileSync(path.join(output,'plan.json'),JSON.stringify(plan,null,2)+'\n');
  const columns = ['id','criteria_passed','criteria_total','defects_found','false_positives','interventions',
    'duration_ms','input_tokens','output_tokens','cache_tokens','cost_usd','dependency_cost_usd','accepted'];
  const scores = plan.map(run => columns.map(column => column === 'id' ? run.id : '').join(','));
  fs.writeFileSync(path.join(output,'scores.csv'), [columns.join(','), ...scores].join('\n') + '\n');
  console.log('Prepared '+plan.length+' offline runs in '+output);
} finally { fs.rmSync(seed,{recursive:true,force:true}); }
