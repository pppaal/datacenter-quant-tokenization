const cov = require('../coverage.json');
const target = process.argv[2] || 'AssetToken.sol';
for (const key of Object.keys(cov)) {
  if (!key.endsWith(target) && !key.endsWith(target.replace(/\//g, '\\'))) continue;
  const { b, branchMap } = cov[key];
  console.log('==', key);
  for (const id in b) {
    const hits = b[id];
    const zero = hits.map((h, i) => (h === 0 ? i : -1)).filter((i) => i >= 0);
    if (zero.length > 0) {
      const m = branchMap[id];
      console.log(
        'branch',
        id,
        'type',
        m.type,
        'line',
        m.line,
        'uncovered:',
        zero,
        'loc:',
        JSON.stringify(m.loc || m.locations)
      );
    }
  }
}
