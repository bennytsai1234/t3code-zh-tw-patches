// Builds the Linux x64 runtime (npm `t3` package) from the official executable and the Windows build.
// The executable is a Node single-executable application; its server is one embedded module asset
// (binMain.mjs). The patched module replaces it at the same byte length, so the rest of the
// executable stays byte-identical. The web client ships beside the executable and matches the
// Windows server.asar client, so it is taken from the Windows zh-release.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const acorn = require('acorn');
const { readArchive } = require('./asarRewrite');
const { patchRunner, patchFacade, patchServer } = require('./serverThinking.cjs');
const { findServerModule } = require('./seaAsset.cjs');

const [linuxOrig, windowsOrig, windowsRelease, destination] = process.argv.slice(2);
if (!destination) throw Error('Usage: node tools/buildLinux.cjs <linux-orig> <windows-orig> <windows-zh-release> <output-directory>');
const supported = '0.1.12';
const officialT3 = '9ee30165e321c20521df68c7de1614759369aecf00d33077ee1d367fe50858cf';
// Windows server.asar name -> name in the Linux bundle; identical names are listed so they are checked too.
const names = {
  add$2: 'add$3', gen: 'gen$1', catch_: 'catch_$2', succeed: 'succeed$7', provide$1: 'provide$3',
  layer$199: 'layer$231', fn: 'fn$1', String: 'String$7',
  Struct: 'Struct', TextGeneration: 'TextGeneration', fromRunner: 'fromRunner', byOpenCodeRuntime: 'byOpenCodeRuntime',
  authenticateRawRouteWithScope: 'authenticateRawRouteWithScope', AuthOrchestrationOperateScope: 'AuthOrchestrationOperateScope',
  HttpServerRequest: 'HttpServerRequest', jsonUnsafe: 'jsonUnsafe', ThreadManagementService: 'ThreadManagementService',
  ProjectStoreV2: 'ProjectStoreV2', isNone: 'isNone', resolveProjectSettings: 'resolveProjectSettings',
  ServerSettingsService: 'ServerSettingsService', catchTags: 'catchTags', toResponse: 'toResponse',
  layerSourceControlProviderRegistry: 'layerSourceControlProviderRegistry'
};
const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');
const output = path.resolve(destination);
if ([linuxOrig, windowsOrig, windowsRelease].some(p => path.resolve(p) === output)) throw Error('原始與輸出目錄必須不同。');

const exe = fs.readFileSync(path.join(linuxOrig, 't3'));
if (sha256(exe) !== officialT3) throw Error(`t3 並非 ${supported} 的官方 Linux x64 執行檔；請勿以已修改的執行檔重複套用。`);

const { start, size } = findServerModule(exe);

function check(source) {
  const result = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: source, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw Error(`binMain.mjs: ${result.stderr}`);
}
let src = patchServer(patchFacade(patchRunner(exe.subarray(start, start + size).toString('utf8'), names), names), names);
check(src);

const comments = [];
const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true,
  onComment: (block, text, from, to) => { if (!block && src[from - 1] === '\n' && src[to] === '\n' && /^ (?:src|\.\.)\//.test(text)) comments.push([from, to + 1]); } });
const topLevel = new Set();
for (const node of ast.body) {
  if (node.type === 'VariableDeclaration') for (const d of node.declarations) if (d.id.type === 'Identifier') topLevel.add(d.id.name);
  if ((node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') && node.id) topLevel.add(node.id.name);
  if (node.type === 'ImportDeclaration') for (const s of node.specifiers) topLevel.add(s.local.name);
}
const missing = Object.values(names).filter(n => !topLevel.has(n));
if (missing.length) throw Error(`借用的名稱不是 Linux 程式的最上層宣告：${missing.join(', ')}`);

// Make room by dropping bundler path comments ("// src/...") from the end, then pad with spaces.
let excess = Buffer.byteLength(src) - size, removed = 0;
while (excess > 0) {
  const [from, to] = comments.pop() ?? [];
  if (from === undefined) throw Error('可移除的路徑註解不足以容納補丁。');
  src = src.slice(0, from) + src.slice(to);
  excess -= to - from;
  removed++;
}
src += ' '.repeat(-excess);
check(src);
const patched = Buffer.from(src);
if (patched.length !== size) throw Error('補丁後的伺服器程式長度不符。');

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
const t3 = Buffer.from(exe);
patched.copy(t3, start);
fs.writeFileSync(path.join(output, 't3'), t3, { mode: 0o755 });

// Client: the Linux files must match the Windows original before the Windows translation is used.
const prefix = 'apps/server/dist/client/';
const clientOf = archive => new Map(archive.files.filter(([p]) => p.startsWith(prefix)).map(([p, e]) => [p.slice(prefix.length), archive.read(e)]));
const originalClient = clientOf(readArchive(path.join(windowsOrig, 'server.asar')));
const linuxClient = [];
(function walk(dir, rel) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(path.join(dir, entry.name), r);
    else linuxClient.push(r);
  }
})(path.join(linuxOrig, 'client'), '');
const differing = linuxClient.filter(r => !originalClient.get(r)?.equals(fs.readFileSync(path.join(linuxOrig, 'client', r))));
if (differing.length || linuxClient.length !== originalClient.size) throw Error(`Linux 前端與 Windows 官方前端不同：${differing.slice(0, 5).join(', ') || '檔案數不同'}`);
if (JSON.parse(fs.readFileSync(path.join(windowsRelease, 'patch-manifest.json'), 'utf8')).version !== supported) throw Error(`Windows 補丁成品不是 ${supported} 的建置。`);
const releaseClient = clientOf(readArchive(path.join(windowsRelease, 'server.asar')));
const lines = [];
for (const [r, buf] of [...releaseClient].sort(([a], [b]) => (a < b ? -1 : 1))) {
  fs.mkdirSync(path.dirname(path.join(output, 'client', r)), { recursive: true });
  fs.writeFileSync(path.join(output, 'client', r), buf);
  lines.push(`${sha256(buf)}  client/${r}`);
}
fs.writeFileSync(path.join(output, 'SHA256SUMS'), `${sha256(t3)}  t3\n${lines.join('\n')}\n`);
fs.writeFileSync(path.join(output, 'patch-manifest.json'), JSON.stringify({ version: supported, platform: 'linux-x64', upstreamCommit: 'ca81b7b97a1c', official: { t3: officialT3 }, hashes: { t3: sha256(t3) } }, null, 2) + '\n');
console.log(`伺服器程式：移除 ${removed} 行路徑註解騰出空間，長度維持 ${size} 位元組，通過 V8 語法檢查與名稱檢查。`);
console.log(`前端：${linuxClient.length} 個檔案與 Windows 官方前端相同，已換成繁中版。`);
console.log(`已建置 ${output}`);
