const { pdf } = require('pdf-to-img');
const fs = require('fs');
const path = require('path');

(async () => {
  const inputPath = process.argv[2];
  const outputDir = process.argv[3];
  const scale = parseFloat(process.argv[4] || '2.0');
  const maxPages = parseInt(process.argv[5] || '10', 10);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const buf = fs.readFileSync(inputPath);
  const doc = await pdf(buf, { scale });
  const count = Math.min(doc.length, maxPages);

  for (let i = 1; i <= count; i++) {
    const img = await doc.getPage(i);
    if (!Buffer.isBuffer(img)) continue;
    const out = path.join(outputDir, 'page-' + i + '.png');
    fs.writeFileSync(out, img);
    console.log(out);
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
