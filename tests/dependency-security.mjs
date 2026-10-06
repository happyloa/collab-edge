import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

// The audit exception is valid only for the patched version in this lockfile.
const lock = readFileSync('pnpm-lock.yaml', 'utf8');
const versions = new Set(
  [...lock.matchAll(/^ {2}braces@([^\s:(]+)(?:\([^\n]*\))?:/gm)].map(
    (match) => match[1],
  ),
);
assert.deepEqual(
  [...versions],
  ['3.0.3'],
  'Review the braces patch on version changes',
);

const require = createRequire(import.meta.url);
let resolveFrom = createRequire(import.meta.resolve('vinext'));
for (const name of [
  'vite-plugin-commonjs',
  'vite-plugin-dynamic-import',
  'fast-glob',
  'micromatch',
])
  resolveFrom = createRequire(resolveFrom.resolve(name));

{
  const braces = require(resolveFrom.resolve('braces'));
  assert.deepEqual(braces.expand('src/{app,components}/*.{ts,tsx}'), [
    'src/app/*.ts',
    'src/app/*.tsx',
    'src/components/*.ts',
    'src/components/*.tsx',
  ]);
  assert.equal(braces.compile('a/{01..03}/b'), 'a/(0[1-3])/b');
  assert.deepEqual(braces.expand('a/{x,{1..3},y}/c'), [
    'a/x/c',
    'a/1/c',
    'a/2/c',
    'a/3/c',
    'a/y/c',
  ]);
  assert.equal(braces.stringify('a/\\{x,y\\}/b'), 'a/{x,y}/b');

  const rejectsNesting = (fn) =>
    assert.throws(fn, {
      name: 'RangeError',
      message: 'Maximum nesting depth exceeded',
    });
  for (const [open, close] of [
    ['{', '}'],
    ['(', ')'],
    ['{(', ')}'],
  ]) {
    const pattern = `${open.repeat(2000)}a${close.repeat(2000)}`;
    for (const operation of ['parse', 'compile', 'expand', 'stringify'])
      rejectsNesting(() => braces[operation](pattern));
    rejectsNesting(() => braces(pattern));
    rejectsNesting(() => braces.parse(open.repeat(2000)));
  }

  // Callers can supply ASTs directly, bypassing the parser.
  for (const operation of ['compile', 'expand', 'stringify']) {
    let ast = { type: 'root', nodes: [] };
    for (let depth = 0; depth < 2000; depth++)
      ast = { type: 'root', nodes: [ast] };
    rejectsNesting(() => braces[operation](ast));
  }
}
console.log(
  'Patched braces rejects deep strings and ASTs; ordinary globs still work',
);

const sourceMapVersions = new Set(
  [...lock.matchAll(/^ {2}source-map-js@([^\s:(]+)(?:\([^\n]*\))?:/gm)].map(
    (match) => match[1],
  ),
);
assert.ok(sourceMapVersions.size > 0, 'Source-map dependency graph is missing');
for (const version of sourceMapVersions) {
  const parts = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  assert.ok(parts, 'Review non-stable source-map-js versions');
  const [major, minor, patch] = parts.slice(1).map(Number);
  assert.ok(
    major > 1 || (major === 1 && (minor > 2 || (minor === 2 && patch >= 2))),
    `Vulnerable source-map-js ${version} remains in the lockfile`,
  );
}
{
  const fromPostcss = createRequire(
    createRequire(import.meta.resolve('vite')).resolve('postcss'),
  );
  const { SourceMapConsumer, SourceNode } = require(
    fromPostcss.resolve('source-map-js'),
  );
  const map = {
    version: 3,
    sources: ['input.js'],
    names: [],
    mappings: 'AAAA',
    sourcesContent: ['a();'],
  };
  const indexed = (line) => ({
    version: 3,
    sections: [{ offset: { line, column: 0 }, map }],
  });
  const valid = new SourceMapConsumer(indexed(0));
  assert.equal(
    SourceNode.fromStringWithSourceMap('a();', valid).toString(),
    'a();',
  );
  // Construction must reject before a generator can amplify this tiny map.
  for (const line of [1e9, -1, Infinity, NaN, 1.5])
    assert.throws(() => new SourceMapConsumer(indexed(line)), /Section offset/);
  assert.throws(
    () =>
      new SourceMapConsumer({
        version: 3,
        sections: [{ offset: { line: 1e7, column: 0 }, map: indexed(1) }],
      }),
    /offset line/i,
  );
}
console.log(
  'Source-map offsets reject malicious amplification; valid maps work',
);
