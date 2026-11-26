// CommonMark + GFM parser for reply translation, bundled from the pinned packages in package.json
// into one script that declares `zhMarkdown` (zhMarkdown.parse(text) returns an mdast tree with
// source offsets). The app's own renderer does not expose such a tree, so the patch ships this one.
const path = require('path');
const esbuild = require('esbuild');

const entry = `
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';
export function parse(text) {
  return fromMarkdown(text, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
}
`;

function bundleMarkdownParser() {
  const result = esbuild.buildSync({
    stdin: { contents: entry, resolveDir: __dirname, loader: 'js' },
    bundle: true, write: false, minify: true, legalComments: 'none', charset: 'utf8',
    format: 'iife', globalName: 'zhMarkdown', target: 'es2022',
    // Neutral platform with the default condition picks the entity decoder that needs no DOM,
    // so the same code runs in the browser and in the Node tests.
    platform: 'neutral', mainFields: ['module', 'main'], conditions: ['default'],
    nodePaths: [path.join(__dirname, 'node_modules')], metafile: true
  });
  if (Object.keys(result.metafile.inputs).some(input => /\.dom\.js$/.test(input))) throw Error('Markdown 解析器打包結果用到 DOM 版本的模組。');
  const code = result.outputFiles[0].text;
  return code.replace(/^var zhMarkdown=/, 'const zhMarkdown=');
}

module.exports = { bundleMarkdownParser };
