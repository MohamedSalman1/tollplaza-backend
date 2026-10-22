// Wrapper so sequelize-cli (which uses dynamic import()) gets a .cjs file.
// Node loads .cjs as CommonJS, tsx/cjs registers synchronously, then
// require() transpiles config.ts before we re-export it.
require('tsx/cjs');
const config = require('./config.ts');
module.exports = config.default ?? config;
