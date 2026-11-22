import fs from 'node:fs';
import path from 'node:path';
import { contract } from '../../plugins/uc-core/hooks/lib/verification.mjs';

// Fixtures use the same active project contract regardless of which proof is being tested.
export function version2(dir, body, criterion = '1. c') {
  const folder = path.join(dir, '.uc');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'criteria.md'), '## Acceptance criteria\n- ' + criterion + '\n');
  return { schemaVersion: 2, platform: process.platform, criteriaDigest: contract(dir).digest,
    ...body, checks: body.checks?.map(c => ({ type: 'command', ...c })) };
}
