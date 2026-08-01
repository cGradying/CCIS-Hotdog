// Plain-node self-check for the two purely-logic fixes in this round:
// joinWithLimit truncation, and the mutate() queue not losing an update
// when two mutations overlap. No test framework — run with:
//   node scripts/self-check.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { joinWithLimit } from '../src/bot.js';
import { addResource, getAllBySubject } from '../src/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '..', 'data', 'resources.json');

let failures = 0;
function check(name, fn) {
  return (async () => {
    try {
      await fn();
      console.log(`  ok  ${name}`);
    } catch (error) {
      failures++;
      console.log(`FAIL  ${name}`);
      console.log(`      ${error instanceof Error ? error.message : String(error)}`);
    }
  })();
}

async function main() {
  console.log('\njoinWithLimit');

  await check('leaves input untouched under the limit', () => {
    const lines = ['a', 'b', 'c'];
    assert.equal(joinWithLimit(lines, 100, 'item'), 'a\nb\nc');
  });

  await check('truncates and appends a count when over the limit', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `line ${i} `.repeat(5));
    const out = joinWithLimit(lines, 200, 'item');
    assert.ok(out.length <= 200, `expected length <= 200, got ${out.length}`);
    assert.match(out, /…and \d+ more items?$/);
  });

  console.log('\nstore.js mutate() queue (local file backend)');

  // This backend writes to data/resources.json — clean up before and after
  // so the self-check leaves no artifact (the file doesn't exist in a fresh
  // checkout, per .gitignore).
  const preExisting = fs.existsSync(DATA_FILE) ? fs.readFileSync(DATA_FILE, 'utf-8') : null;
  fs.rmSync(DATA_FILE, { force: true });

  await check('two overlapping mutations both land (no lost update)', async () => {
    const subject = 'SELFCHECK 999';
    // Fire two adds "at the same time" — addResource's readStore()/writeStore()
    // pair must be serialized by mutate(), or the second write clobbers the
    // first.
    await Promise.all([
      addResource({ subject, title: 'First', link: 'https://example.com/1', submittedBy: 'test' }),
      addResource({ subject, title: 'Second', link: 'https://example.com/2', submittedBy: 'test' }),
    ]);
    const entries = await getAllBySubject(subject);
    assert.equal(entries.length, 2, `expected 2 entries, got ${entries.length}`);
  });

  fs.rmSync(DATA_FILE, { force: true });
  if (preExisting !== null) fs.writeFileSync(DATA_FILE, preExisting);

  console.log(failures ? `\n${failures} check(s) failed\n` : '\nall checks passed\n');
  process.exit(failures ? 1 : 0);
}

main();
