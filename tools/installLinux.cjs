// Runs on the Linux computer; needs only Node.js.
//   node installLinux.cjs <linux-zh-release>   install, keeping the official t3 and client
//   node installLinux.cjs --restore            put the official t3 and client back
// The runtime directory defaults to $T3CODE_HOME/runtime/versions/0.1.11 (T3CODE_HOME defaults to ~/.t3).
// Files are swapped by rename, so the running service keeps its open executable until it restarts.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const version = '0.1.11';
const officialT3 = 'f13dd1f37eb2f719b41f45219b3800412799c80f724b022839b8a133e21aced1';
const args = process.argv.slice(2);
const restore = args[0] === '--restore';
const source = restore ? null : args[0];
if (!restore && !source) throw Error('Usage: node installLinux.cjs <linux-zh-release> | --restore');
const home = process.env.T3CODE_HOME?.trim() ? path.resolve(process.env.T3CODE_HOME.trim().replace(/^~(?=$|\/)/, os.homedir())) : path.join(os.homedir(), '.t3');
const runtime = path.join(home, 'runtime', 'versions', version);
const backup = path.join(home, 'zh-tw-official', version);
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function sums(dir) {
  return fs.readFileSync(path.join(dir, 'SHA256SUMS'), 'utf8').trim().split('\n').map(line => {
    const [hash, file] = line.split(/ {2}/);
    return { hash, file };
  });
}
function verify(dir) {
  for (const { hash, file } of sums(dir)) if (sha256(path.join(dir, file)) !== hash) throw Error(`校驗失敗：${path.join(dir, file)}`);
}
function writeSums(dir) {
  const lines = [];
  (function walk(rel) {
    for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const r = path.posix.join(rel, entry.name);
      if (entry.isDirectory()) walk(r);
      else lines.push(`${sha256(path.join(dir, r))}  ${r}`);
    }
  })('client');
  fs.writeFileSync(path.join(dir, 'SHA256SUMS'), `${sha256(path.join(dir, 't3'))}  t3\n${lines.sort().join('\n')}\n`);
}
// Stage beside the target, verify, then rename into place.
function swapIn(from) {
  const staging = path.join(runtime, '.zh-tw-staging');
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging);
  fs.copyFileSync(path.join(from, 't3'), path.join(staging, 't3'));
  fs.chmodSync(path.join(staging, 't3'), 0o755);
  fs.cpSync(path.join(from, 'client'), path.join(staging, 'client'), { recursive: true });
  fs.copyFileSync(path.join(from, 'SHA256SUMS'), path.join(staging, 'SHA256SUMS'));
  verify(staging);
  const previous = path.join(runtime, '.zh-tw-previous-client');
  fs.rmSync(previous, { recursive: true, force: true });
  fs.renameSync(path.join(runtime, 'client'), previous);
  fs.renameSync(path.join(staging, 'client'), path.join(runtime, 'client'));
  fs.renameSync(path.join(staging, 't3'), path.join(runtime, 't3'));
  fs.rmSync(previous, { recursive: true, force: true });
  fs.rmSync(staging, { recursive: true, force: true });
}

if (fs.readFileSync(path.join(runtime, '.install-complete'), 'utf8').trim() !== version) throw Error(`${runtime} 不是 ${version}。`);
const current = sha256(path.join(runtime, 't3'));
if (restore) {
  if (sha256(path.join(backup, 't3')) !== officialT3) throw Error(`找不到官方備份：${backup}`);
  verify(backup);
  swapIn(backup);
  console.log('已還原官方 t3 與網頁介面。');
} else {
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'patch-manifest.json'), 'utf8'));
  if (manifest.version !== version || manifest.platform !== 'linux-x64') throw Error('不支援此補丁版本。');
  verify(source);
  if (sha256(path.join(source, 't3')) !== manifest.hashes.t3) throw Error('補丁 t3 與清單不符。');
  if (current === officialT3) {
    fs.rmSync(backup, { recursive: true, force: true });
    fs.mkdirSync(backup, { recursive: true });
    fs.copyFileSync(path.join(runtime, 't3'), path.join(backup, 't3'));
    fs.cpSync(path.join(runtime, 'client'), path.join(backup, 'client'), { recursive: true });
    writeSums(backup);
    console.log(`已備份官方 t3 與網頁介面到 ${backup}`);
  } else if (current !== manifest.hashes.t3) {
    throw Error('已安裝的 t3 既不是官方版也不是這份補丁，未變更任何檔案。');
  }
  if (sha256(path.join(backup, 't3')) !== officialT3) throw Error(`官方備份不完整：${backup}`);
  swapIn(source);
  console.log('已安裝補丁，t3 與網頁介面校驗通過。');
}
console.log('重新啟動 T3 Code 服務後生效：systemctl --user restart t3code');
