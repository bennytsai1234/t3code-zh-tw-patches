const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { readArchive } = require('./asarRewrite');
const [original, destination] = process.argv.slice(2);
if (!original || !destination) throw Error('Usage: node tools/build.cjs <original-resources> <output-directory>');
const input = path.resolve(original), output = path.resolve(destination);
if (input === output) throw Error('原始與輸出目錄必須不同。');
const app = readArchive(path.join(input, 'app.asar'));
const packageEntry = app.files.find(([p]) => p === 'package.json');
const pkg = JSON.parse(app.read(packageEntry[1]).toString('utf8'));
const supported = '0.0.46-nightly.20261015.3158';
if (pkg.version !== supported) throw Error(`此補丁只支援 ${supported}，實際為 ${pkg.version}。`);
const officialHashes = {
  'app.asar': 'e7fe3bb714ec36132e502a5c80fe7909748b410175679d69ae00fb843907d06e',
  'server.asar': 'f3bfdb321ea14763c1e96d157e81998020c5a3bcb98b4582ad0f6d2343b2afbd'
};
for (const [name, expected] of Object.entries(officialHashes)) {
  if (crypto.createHash('sha256').update(fs.readFileSync(path.join(input, name))).digest('hex') !== expected) {
    throw Error(`${name} 並非本版本的官方原始程式包；請勿以已修改的程式包重複套用。`);
  }
}
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 't3zh-build-'));
fs.mkdirSync(output, { recursive: true });
function run(tool, ...args) {
  const result = spawnSync(process.execPath, [path.join(__dirname, tool), ...args], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw Error(`${tool}\n${result.stdout}\n${result.stderr}`);
  // The translation tool's obsolete dictionary entries can be large; retain its summary.
  console.log(result.stdout.split('\n').filter(line => !line.startsWith('unused:')).join('\n').trim());
  if (result.stderr) process.stderr.write(result.stderr);
}
try {
  run('prepareNightly.cjs', input, temp);
  run('patchThinking.cjs', path.join(temp, 'server-fixed.asar'), path.join(temp, 'server-thinking.asar'));
  run('apply.js', path.join(temp, 'server-thinking.asar'), path.join(temp, 'server-zh.asar'), path.join(__dirname, '../translations/client'));
  run('patchLabels.cjs', path.join(temp, 'server-zh.asar'), path.join(output, 'server.asar'));
  run('applyDesktop.js', path.join(temp, 'app-fixed.asar'), path.join(output, 'app.asar'), path.join(__dirname, '../translations/desktop-main.json'));
  for (const name of ['app.asar.unpacked', 'server.asar.unpacked']) {
    if (fs.existsSync(path.join(input, name))) fs.cpSync(path.join(input, name), path.join(output, name), { recursive: true });
  }
  const hashes = {};
  for (const name of ['app.asar', 'server.asar']) hashes[name] = crypto.createHash('sha256').update(fs.readFileSync(path.join(output, name))).digest('hex');
  fs.writeFileSync(path.join(output, 'patch-manifest.json'), JSON.stringify({ version: supported, upstreamCommit: 'e6bbfdb9ffe8', hashes }, null, 2) + '\n');
  console.log(`已建置 ${output}`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
