const { readArchive } = require('./asarRewrite');
const a = readArchive(process.argv[2]);
const entry = a.files.find(([p]) => p === 'package.json');
const version = JSON.parse(a.read(entry[1]).toString('utf8')).version;
if (version !== '0.1.0') throw Error(`版本不符：${version}`);
console.log(`版本符合：${version}`);
