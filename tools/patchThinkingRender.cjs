// Expanded work log: reasoning rows render e.detail as Markdown directly; route only those through ZhThinking.
const from = 'e=e=>(0,$.jsx)(uc,{className:`text-foreground`,text:e.detail??``,cwd:r.markdownCwd,threadRef:r.threadRef??void 0,skills:r.skills,isStreaming:s(e),headingLevelOffset:3,onUseArtifactTemplate:r.onUseArtifactTemplate,onImageExpand:r.onImageExpand,lineBreaks:!0},e.id),';
const to = 'e=e=>e.itemType===`reasoning`?(0,$.jsx)(ZhThinking,{text:e.detail??``,active:s(e),environmentId:r.threadRef?.environmentId,threadId:r.threadRef?.threadId,render:text=>(0,$.jsx)(uc,{className:`text-foreground`,text,cwd:r.markdownCwd,threadRef:r.threadRef??void 0,skills:r.skills,isStreaming:s(e),headingLevelOffset:3,onUseArtifactTemplate:r.onUseArtifactTemplate,onImageExpand:r.onImageExpand,lineBreaks:!0})},e.id):(0,$.jsx)(uc,{className:`text-foreground`,text:e.detail??``,cwd:r.markdownCwd,threadRef:r.threadRef??void 0,skills:r.skills,isStreaming:s(e),headingLevelOffset:3,onUseArtifactTemplate:r.onUseArtifactTemplate,onImageExpand:r.onImageExpand,lineBreaks:!0},e.id),';

function patchExpandedReasoningRenderer(source) {
  const matches = source.split(from).length - 1;
  if (matches !== 1) throw new Error(`Expected one expanded reasoning renderer, found ${matches}.`);
  return source.replace(from, () => to);
}

module.exports = { patchExpandedReasoningRenderer };
