import { readFileSync, readdirSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';

const DIR = process.argv[2] || 'lib/kaan-os-core';
const manifest = JSON.parse(readFileSync(join(DIR, '.core-version'), 'utf8'));
const files = readdirSync(DIR).filter(f => f.endsWith('.ts')).sort();
const violations = [];

for (const f of files) {
  const actual = createHash('sha256').update(readFileSync(join(DIR, f))).digest('hex');
  const pinned = manifest.files[f];
  if (!pinned) violations.push(f + ' -- not in pinned manifest (added without re-pin)');
  else if (pinned !== actual) violations.push(f + ' -- content drifted from ' + manifest.tag);
}
for (const f of Object.keys(manifest.files)) {
  if (!files.includes(f)) violations.push(f + ' -- pinned but missing on disk');
}

if (violations.length === 0) {
  console.log('check-core-drift: ' + files.length + ' files match ' + manifest.tag + ', 0 violations');
  process.exit(0);
}
for (const v of violations) console.error('DRIFT: ' + v);
console.error('check-core-drift: ' + violations.length + ' violations. lib/kaan-os-core is a pinned copy of ' + manifest.tag + ' in dreamturkiye/kaan-os-core -- change it THERE, re-tag, re-sync, re-pin. Never edit the copy directly.');
process.exit(1);
