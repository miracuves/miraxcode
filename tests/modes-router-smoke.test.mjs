import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortChainByQuality } from '../src/js/modes/code/router.js';

test('sortChainByQuality keeps primary model first', () => {
  const chain = [
    { label: 'A', model: 'gpt-4o' },
    { label: 'B', model: 'llama3.2' },
  ];
  const sorted = sortChainByQuality(chain);
  assert.equal(sorted[0].label, 'A');
});
