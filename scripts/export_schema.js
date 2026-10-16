// node scripts/export_schema.js  -> docs/config.schema.json (from js/schema.js)
const fs = require('fs'), path = require('path'); require('../js/schema.js');
const out = path.join(__dirname, '../docs/config.schema.json'); fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(MF_SCHEMA.SCHEMA, null, 2) + '\n'); console.log('wrote', out);
