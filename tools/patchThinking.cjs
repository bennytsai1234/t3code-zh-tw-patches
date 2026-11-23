const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { readArchive, writeArchive } = require('./asarRewrite');
const { patchExpandedReasoningRenderer } = require('./patchThinkingRender.cjs');
const { patchTextGeneration, patchServer } = require('./serverThinking.cjs');
const [input, output] = process.argv.slice(2);
if (!input || !output) throw Error('Usage: node patchThinking.cjs <input-server.asar> <output-server.asar>');
const archive = readArchive(input);
const replacements = new Map();
function once(src, from, to) {
  const n = src.split(from).length - 1;
  if (n !== 1) throw Error(`Expected one pinned-version match, found ${n}: ${from.slice(0,100)}`);
  return src.replace(from, () => to);
}
const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
function edit(pattern, transform) {
  const matches = archive.files.filter(([p]) => pattern.test(p));
  if (matches.length !== 1) throw Error(`Expected one module ${pattern}, got ${matches.length}`);
  const [p, entry] = matches[0];
  const source = transform(archive.read(entry).toString('utf8'));
  const checked = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: source, encoding: 'utf8' });
  if (checked.status !== 0) throw Error(`${p}: ${checked.stderr}`);
  replacements.set(p, Buffer.from(source));
}
edit(/\/runtimeLayer-CyWe8jGq\.mjs$/, src => patchTextGeneration(src));
edit(/\/server-8K5Ixyrs\.mjs$/, src => patchServer(src));
// Environment-scoped request through the app's authenticated client (Bearer or DPoP, with nonce renewal).
edit(/\/client\/assets\/utils-CfAhq9cy\.js$/, src => src + '\n' + read('thinking-runtime.inc.js'));
edit(/\/client\/assets\/useTimelineFollow-C4e5Dy-8\.js$/, src => {
  // Separate names from the timeline module's imports avoid its local shadowing.
  src = ['import { zhTranslateEffect, Ff as zhAtomsFactory, zhOptionToNullable, zhPending, Ju as zhThinkingRegistryContext } from "./utils-CfAhq9cy.js";',
    'import { t as zhThinkingRuntime } from "./runtime-DLJNEawq.js";',
    'const zhEnvironmentAtoms = zhAtomsFactory(zhThinkingRuntime);', ''].join('\n') + src;
  src = once(src, '(0,$.jsx)(Si,{inline:!0,text:(n.entry.detail??s).slice(0,h_),cwd:r.markdownCwd,parseRawHtml:!1,extraRemarkPlugins:n.active?v_(i(`Thinking`)):v_(i(`Thought`))})', '(0,$.jsx)(ZhThinking,{text:n.entry.detail??s,active:n.active,environmentId:r.activeThreadEnvironmentId,threadId:r.threadRef?.threadId,render:text=>(0,$.jsx)(Si,{inline:!0,text:text.slice(0,h_),cwd:r.markdownCwd,parseRawHtml:!1,extraRemarkPlugins:n.active?v_(i(`Thinking`)):v_(i(`Thought`))})})');
  src = once(src, '(0,$.jsx)(Si,{inline:!0,text:(n.detail??B).slice(0,h_),cwd:a.markdownCwd,parseRawHtml:!1,extraRemarkPlugins:n.toolLifecycleStatus===`inProgress`?v_(o(`Thinking`)):v_(o(`Thought`))})', '(0,$.jsx)(ZhThinking,{text:n.detail??B,active:n.toolLifecycleStatus===`inProgress`,environmentId:a.activeThreadEnvironmentId,threadId:a.threadRef?.threadId,render:text=>(0,$.jsx)(Si,{inline:!0,text:text.slice(0,h_),cwd:a.markdownCwd,parseRawHtml:!1,extraRemarkPlugins:n.toolLifecycleStatus===`inProgress`?v_(o(`Thinking`)):v_(o(`Thought`))})})');
  src = once(src, '(0,$.jsx)(Si,{text:o.text,cwd:e.cwd,threadRef:{environmentId:e.environmentId,threadId:e.projectedItem.sourceThreadId},lineBreaks:!0})', '(0,$.jsx)(ZhThinking,{text:o.text,environmentId:e.environmentId,threadId:e.projectedItem.sourceThreadId,render:text=>(0,$.jsx)(Si,{text,cwd:e.cwd,threadRef:{environmentId:e.environmentId,threadId:e.projectedItem.sourceThreadId},lineBreaks:!0})})');
  src = patchExpandedReasoningRenderer(src);
  src = once(src, '(0,$.jsx)(Si,{text:s,renderInsights:!0,cwd:m,agentDirectories:h,threadRef:g,isStreaming:_,lineBreaks:v,skills:r.skills,headingLevelOffset:3,onUseArtifactTemplate:r.onUseArtifactTemplate,onRunShellCommand:r.onRunShellCommand,onImageExpand:r.onImageExpand})', '(0,$.jsx)(ZhThinking,{kind:"response",text:s,active:_,environmentId:g?.environmentId,threadId:g?.threadId,render:text=>(0,$.jsx)(Si,{text,renderInsights:!0,cwd:m,agentDirectories:h,threadRef:g,isStreaming:_,lineBreaks:v,skills:r.skills,headingLevelOffset:3,onUseArtifactTemplate:r.onUseArtifactTemplate,onRunShellCommand:r.onRunShellCommand,onImageExpand:r.onImageExpand})})');
  return src + '\n' + read('thinking-request.inc.js') + '\n' + read('response-markdown.inc.js') + '\n' + read('thinking-client.inc.js');
});
writeArchive(input, output, replacements);
console.log('思考與回覆翻譯：已修改後端、環境授權傳輸與顯示接點，通過 V8 語法檢查。');
