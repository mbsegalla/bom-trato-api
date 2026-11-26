import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const summary = JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf8'));
const targets = {
  Domain: 95,
  Application: 90,
  Infrastructure: 80,
  Presentation: 80,
  Other: null,
};
const totals = Object.fromEntries(
  Object.keys(targets).map((layer) => [
    layer,
    {
      lines: { total: 0, covered: 0 },
      branches: { total: 0, covered: 0 },
      functions: { total: 0, covered: 0 },
    },
  ]),
);
const missing = [];

for (const [file, metrics] of Object.entries(summary)) {
  if (file === 'total') continue;
  const path = relative(process.cwd(), resolve(file)).split(sep).join('/');
  const match = /^src\/modules\/[^/]+\/(domain|application|infrastructure|presentation)\//.exec(path);
  const layer = match ? match[1][0].toUpperCase() + match[1].slice(1) : 'Other';
  for (const metric of ['lines', 'branches', 'functions']) {
    totals[layer][metric].total += metrics[metric].total;
    totals[layer][metric].covered += metrics[metric].covered;
  }
  if (metrics.lines.total > 0 && metrics.lines.covered === 0) missing.push(path);
}
function percent(value) {
  return value.total === 0 ? 'n/a' : ((100 * value.covered) / value.total).toFixed(1) + '%';
}
const report = [
  '# API coverage by architectural layer',
  '',
  '| Layer | Lines | Branches | Functions | Line coverage goal (non-blocking) |',
  '|---|---:|---:|---:|---:|',
  ...Object.entries(totals).map(
    ([layer, metrics]) =>
      '| ' +
      [
        layer,
        percent(metrics.lines),
        percent(metrics.branches),
        percent(metrics.functions),
        targets[layer] === null ? '-' : targets[layer] + '%',
      ].join(' | ') +
      ' |',
  ),
  '',
  '## Files with zero covered lines (' + missing.length + ')',
  '',
  ...missing.sort().map((file) => '- ' + file),
  '',
].join('\n');
writeFileSync('coverage/layers.md', report);
console.log(report.split('## Files')[0]);
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    report.split('## Files')[0] +
      '\nZero-coverage files: ' +
      missing.length +
      '. See coverage/layers.md for the list.\n',
  );
