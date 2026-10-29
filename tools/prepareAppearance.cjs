const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
// node prepareAppearance.cjs <original-resources-directory> <output-directory>
const tools = __dirname;
const { readArchive, writeArchive } = require(path.join(tools, 'asarRewrite'));
if (process.argv.length !== 4) throw new Error('Usage: node prepareAppearance.cjs <original-resources-directory> <output-directory>');
const root = path.resolve(process.argv[2]);
const dest = path.resolve(process.argv[3]);
fs.mkdirSync(dest, { recursive: true });
const patches = JSON.parse(fs.readFileSync(path.join(tools, '../appearance-fix/changes-0.0.45.json'), 'utf8'));
function check(source, module = false) {
  const result = spawnSync(process.execPath, [...(module ? ['--input-type=module'] : []), '--check'], { input: source, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
}
function replaceOnce(source, from, to) {
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`Expected one match, found ${count}: ${from.slice(0, 90)}`);
  return source.replace(from, to);
}
const server = readArchive(path.join(root, 'server.asar'));
const fontFiles = server.files.filter(([p]) => /\/client\/assets\/appearanceFonts-BFmnXpD6\.js$/.test(p));
if (fontFiles.length !== 1) throw new Error(`Expected one font module, got ${fontFiles.length}`);
const [fontPath, fontEntry] = fontFiles[0];
let fontSource = server.read(fontEntry).toString('utf8');
const fontPattern = /function (\w+)\(e\)\{let t=(\w+)\(e\);if\(t===null\)return!0;try\{if\((\w+)===void 0&&\(\3=document\.createElement\(`canvas`\)\.getContext\(`2d`\)\),\3===null\)return!0;let e=\3;for\(let n of (\w+)\)if\(e\.font=`\$\{n\} 32px \$\{t\}, monospace`,!(\w+)\((\w+)\.map\(t=>e\.measureText\(t\)\.width\)\)\)return!1;return!0\}catch\{return!0\}\}/g;
const fontMatches = [...fontSource.matchAll(fontPattern)];
if (fontMatches.length !== 1) throw new Error(`Expected one monospace detector, got ${fontMatches.length}`);
const fontMatch = fontMatches[0];
const oldNames = ['AG', 'gG', 'CG'];
let fontReplacement = patches[0].to;
for (let i = 0; i < oldNames.length; i++) fontReplacement = fontReplacement.replace(new RegExp(`\\b${oldNames[i]}\\b`, 'g'), fontMatch[i + 1]);
fontSource = replaceOnce(fontSource, fontMatch[0], fontReplacement);
check(fontSource, true);
writeArchive(path.join(root, 'server.asar'), path.join(dest, 'server-fixed.asar'), new Map([[fontPath, Buffer.from(fontSource)]]));
const app = readArchive(path.join(root, 'app.asar'));
const [mainPath, mainEntry] = app.files.find(([p]) => p.endsWith('/main.cjs'));
let main = app.read(mainEntry).toString('utf8');
main = patches[2].to + main;
main = replaceOnce(main, patches[3].from, patches[3].to);
const themePattern = /yield\* electronTheme\.onUpdated\(\(\) => \{\n\t\t\trunEffect\(desktopWindow\.syncAppearance\.pipe\((withSpan(?:\$\d+)?)\("desktop\.lifecycle\.themeUpdated"\)\)\);\n\t\t\}\);\n\t\t/g;
const themeMatches = [...main.matchAll(themePattern)];
if (themeMatches.length !== 1) throw new Error(`Expected one theme listener, got ${themeMatches.length}`);
main = replaceOnce(main, themeMatches[0][0], patches[4].to.replaceAll('withSpan(', themeMatches[0][1] + '('));
check(main);
writeArchive(path.join(root, 'app.asar'), path.join(dest, 'app-fixed.asar'), new Map([[mainPath, Buffer.from(main)]]));
fs.writeFileSync(path.join(dest, 'appearance-report.json'), JSON.stringify({ version: '0.1.4', fontPath, patches: ['monospace cache and reduced font measurements', 'unhandledRejection handler', 'window appearance try/catch', 'theme event rejection handling'], optionalReactMemoPatch: 'not carried: old appearance route replaced upstream; documented as unnecessary' }, null, 2));
console.log('Appearance fixes prepared; all changed JavaScript passed V8 syntax checks.');
