const path = require('path');
const { rollup } = require('rollup');
const getCfg = require(path.resolve(__dirname, '../dinou/rollup/rollup.config.js'));

async function test() {
  const c = await getCfg();
  const b = await rollup(c);
  const { output } = await b.generate(c.output);
  for (const item of output) {
    if (['refresh.js', 'runtime.js', 'main.js'].includes(item.fileName)) {
      console.log(`=== ${item.fileName} ===`);
      console.log(item.code ? item.code.slice(0, 500) : '[Asset]');
      console.log('--- end snippet ---');
    }
  }
}
test().catch(console.error);
