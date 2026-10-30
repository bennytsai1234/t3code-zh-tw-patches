// Uses the timeline module's existing Markdown parser (nf). Only prose is sent for translation;
// Markdown syntax, code, links, paths and line breaks are restored locally from the original.
function zhStartsWithEnglish(prose) {
  // Ignore punctuation, whitespace and numbered-list prefixes. Other scripts stop detection.
  const firstLetter = prose.match(/\p{L}/u)?.[0] ?? "";
  return /^[A-Za-z]$/.test(firstLetter);
}
function zhPrepareResponse(text) {
  const ranges = [];
  const boundaries = new Set([0, text.length]);
  const protectedText = /https?:\/\/[^\s<>()]+|(["'])(?:[A-Za-z]:[\\/]|(?:\.{1,2}|~)?\/)[^\r\n]*?\1|[A-Za-z]:[\\/][^\s<>()`"'\[\]]+(?:[ \t]+[^\s<>()`"'\[\]\\/]+)+[\\/][^\s<>()`"'\[\]]+|[A-Za-z]:[\\/][^\s<>()`"'\[\]]+|(?:\.{1,2}|~)?\/[^\s<>()`"'\[\]\/，。；：！？、][^\s<>()`"'\[\]，。；：！？、]*|[^\s<>()`"'\[\]\\/，。；：！？、]+(?:[\\/][^\s<>()`"'\[\]\\/，。；：！？、]+)+(?:[:#]\d+(?::\d+)?)?|[\p{L}\p{N}\p{M}_-]+(?:\.[\p{L}\p{N}\p{M}_-]+)+|\\[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]|&(?:#\d+|#x[\da-f]+|[a-z][\da-z]+);|\r?\n/giu;
  function addProse(start, end) {
    const value = text.slice(start, end);
    const protectedRanges = [];
    for (const match of value.matchAll(protectedText)) {
      const previous = protectedRanges.at(-1);
      if (previous && /^[ \t]+$/.test(value.slice(previous[1], match.index))) previous[1] = match.index + match[0].length;
      else protectedRanges.push([match.index, match.index + match[0].length]);
    }
    let cursor = 0;
    for (const [protectedStart, protectedEnd] of protectedRanges) {
      if (protectedStart > cursor) ranges.push([start + cursor, start + protectedStart]);
      cursor = protectedEnd;
    }
    if (cursor < value.length) ranges.push([start + cursor, end]);
  }
  function walk(node) {
    const start = node.position?.start?.offset, end = node.position?.end?.offset;
    if (Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end <= text.length && start <= end) {
      boundaries.add(start);
      boundaries.add(end);
    }
    if (node.type === "text") {
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > text.length || start > end) {
        throw Error("無法辨識回覆的 Markdown 格式。");
      }
      // Markdown emphasis delimiters depend on adjacent whitespace. A model can
      // remove the English word separator when joining Chinese sentences, making
      // e.g. **完成。**接著 stop parsing as strong. Restore these spaces locally.
      let proseStart = start, proseEnd = end;
      if (/[*_~]/.test(text[start - 1] ?? "")) {
        proseStart += text.slice(start, end).match(/^[ \t]+/)?.[0].length ?? 0;
      }
      if (/[*_~]/.test(text[end] ?? "")) {
        proseEnd -= text.slice(proseStart, end).match(/[ \t]+$/)?.[0].length ?? 0;
      }
      addProse(proseStart, proseEnd);
      return;
    }
    // Shortcut references use the displayed text as the link target; translating it would break the link.
    if (node.type === "linkReference" && node.referenceType !== "full") return;
    if (node.type === "link" && Number.isInteger(start) && Number.isInteger(end)) {
      const raw = text.slice(start, end);
      if (raw.startsWith("<") || /^https?:\/\//i.test(raw)) return;
    }
    if (Array.isArray(node.children)) for (const child of node.children) walk(child);
  }
  const tree = nf.parse(text);
  walk(tree);
  function structure(node) {
    if (node.type === "text") return null;
    const result = { type: node.type };
    for (const key of ["depth", "ordered", "start", "spread", "checked", "align", "url", "title", "identifier", "label", "referenceType", "alt", "lang", "meta"]) {
      if (node[key] !== undefined) result[key] = node[key];
    }
    if (["code", "inlineCode", "html"].includes(node.type)) result.value = node.value;
    if (Array.isArray(node.children)) {
      result.children = node.children.map(structure).filter(Boolean);
      // Chinese word order can move links or inline code within a paragraph; block order remains fixed.
      if (["paragraph", "heading", "tableCell", "emphasis", "strong", "delete", "link", "linkReference"].includes(node.type)) {
        result.children.sort((a, b) => {
          const left = JSON.stringify(a), right = JSON.stringify(b);
          return left < right ? -1 : left > right ? 1 : 0;
        });
      }
    }
    return result;
  }
  const originalStructure = JSON.stringify(structure(tree));
  let prefixNumber = 0, prefix;
  do { prefix = `⟦T3ZH${prefixNumber++}X`; } while (text.includes(prefix));
  const originals = [], markers = [];
  let input = "", cursor = 0, prose = "";
  const cuts = [...boundaries].sort((a, b) => a - b);
  let cutIndex = 0;
  function protect(value) {
    if (!value) return;
    const marker = `${prefix}${originals.length}⟧`;
    originals.push(value);
    markers.push(marker);
    input += marker;
  }
  function protectRange(start, end) {
    while (cutIndex < cuts.length && cuts[cutIndex] <= start) cutIndex++;
    while (cutIndex < cuts.length && cuts[cutIndex] < end) {
      const cut = cuts[cutIndex++];
      protect(text.slice(start, cut));
      start = cut;
    }
    protect(text.slice(start, end));
  }
  for (const [start, end] of ranges) {
    if (start < cursor) throw Error("無法辨識回覆的 Markdown 格式。");
    protectRange(cursor, start);
    const value = text.slice(start, end);
    input += value;
    prose += value + " ";
    cursor = end;
  }
  protectRange(cursor, text.length);
  return {
    input,
    needsTranslation: zhStartsWithEnglish(prose),
    restore(translation) {
      const pattern = new RegExp(`${prefix}\\d+⟧`, "g");
      const found = translation.match(pattern) ?? [];
      const foundSet = new Set(found);
      if (found.length !== markers.length || foundSet.size !== markers.length || markers.some(marker => !foundSet.has(marker)) || /[\r\n]/.test(translation.replace(pattern, ""))) {
        throw Error("譯文未保留回覆格式，已保留原文；可手動重試。");
      }
      const restored = translation.replace(pattern, marker => originals[Number(marker.slice(prefix.length, -1))]);
      if (JSON.stringify(structure(nf.parse(restored))) !== originalStructure) {
        throw Error("譯文未保留回覆格式，已保留原文；可手動重試。");
      }
      return restored;
    }
  };
}
