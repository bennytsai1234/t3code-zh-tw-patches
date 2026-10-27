// Uses the timeline module's existing Markdown parser (Jp). Only prose is sent for translation;
// Markdown syntax, code, links, paths and line breaks are restored locally from the original.
function zhPrepareResponse(text) {
  const ranges = [];
  const protectedText = /https?:\/\/[^\s<>()]+|[A-Za-z]:[\\/][^\s<>()`"'\[\]]+|(?:\.{1,2}|~)?\/[A-Za-z0-9_.~@-][^\s<>()`"'\[\]]*|[A-Za-z0-9_.-]+(?:[\\/][A-Za-z0-9_.-]+)+(?:[:#]\d+(?::\d+)?)?|[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+|\\[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]|&(?:#\d+|#x[\da-f]+|[a-z][\da-z]+);|\r?\n/gi;
  function addProse(start, end) {
    const value = text.slice(start, end);
    let cursor = 0;
    for (const match of value.matchAll(protectedText)) {
      if (match.index > cursor) ranges.push([start + cursor, start + match.index]);
      cursor = match.index + match[0].length;
    }
    if (cursor < value.length) ranges.push([start + cursor, end]);
  }
  function walk(node) {
    const start = node.position?.start?.offset, end = node.position?.end?.offset;
    if (node.type === "text") {
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > text.length || start > end) {
        throw Error("無法辨識回覆的 Markdown 格式。");
      }
      addProse(start, end);
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
  const tree = Jp.parse(text);
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
  function protect(value) {
    if (!value) return;
    const marker = `${prefix}${originals.length}⟧`;
    originals.push(value);
    markers.push(marker);
    input += marker;
  }
  for (const [start, end] of ranges) {
    if (start < cursor) throw Error("無法辨識回覆的 Markdown 格式。");
    protect(text.slice(cursor, start));
    const value = text.slice(start, end);
    input += value;
    prose += value + " ";
    cursor = end;
  }
  protect(text.slice(cursor));
  return {
    input,
    needsTranslation: /[A-Za-z]{2}/.test(prose),
    restore(translation) {
      const pattern = new RegExp(`${prefix}\\d+⟧`, "g");
      const found = translation.match(pattern) ?? [];
      const foundSet = new Set(found);
      if (found.length !== markers.length || foundSet.size !== markers.length || markers.some(marker => !foundSet.has(marker)) || /[\r\n]/.test(translation.replace(pattern, ""))) {
        throw Error("譯文未保留回覆格式，已保留原文；可手動重試。");
      }
      const restored = translation.replace(pattern, marker => originals[Number(marker.slice(prefix.length, -1))]);
      if (JSON.stringify(structure(Jp.parse(restored))) !== originalStructure) {
        throw Error("譯文未保留回覆格式，已保留原文；可手動重試。");
      }
      return restored;
    }
  };
}
