import assert from 'node:assert/strict';
import { ESLint } from 'eslint';
const eslint = new ESLint();
const results = await eslint.lintText(
  'export function Bad() { return <img src="x.png" />; }',
  { filePath: 'components/compatibility-probe.tsx' },
);
assert(
  results[0].messages.some((message) => message.ruleId === 'jsx-a11y/alt-text'),
  'Accessibility plugin must catch a missing alternative text under ESLint 10',
);
const react = await eslint.lintText(
  'export function Bad() { return <div>{[1, 2].map(n => <span>{n}</span>)}</div>; }',
  { filePath: 'components/compatibility-probe.tsx' },
);
assert(
  react[0].messages.some((message) => message.ruleId === 'react/jsx-key'),
  'React plugin must catch missing list keys under ESLint 10',
);
console.log('ESLint 10 compatibility probes passed');
