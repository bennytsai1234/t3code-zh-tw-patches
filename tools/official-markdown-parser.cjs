// Load only the official parser and its dependencies, without starting the browser UI.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const acorn = require('acorn');
const { readArchive } = require('./asarRewrite');

module.exports = function officialMarkdownParser() {
  const file = path.join(__dirname, '../builds/0.1.5/orig/server.asar');
  if (!fs.existsSync(file)) return null;
  const archive = readArchive(file);
  function read(pattern) {
    const matches = archive.files.filter(([name]) => pattern.test(name));
    if (matches.length !== 1) throw Error(`Expected one parser dependency: ${pattern}`);
    return archive.read(matches[0][1]).toString('utf8');
  }
  const src = read(/\/client\/assets\/ChatMarkdown-[^/]+\.js$/);
  const nodes = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' }).body;
  const declarations = new Map(), functions = [];
  for (const node of nodes) {
    if (node.type === 'FunctionDeclaration') functions.push(src.slice(node.start, node.end));
    if (node.type === 'VariableDeclaration') for (const item of node.declarations) {
      if (item.id.type === 'Identifier') declarations.set(item.id.name, 'var ' + src.slice(item.start, item.end));
    }
  }
  const runtime = read(/\/client\/assets\/rolldown-runtime-[^/]+\.js$/);
  const runtimeContext = vm.createContext({});
  vm.runInContext(runtime.slice(0, runtime.lastIndexOf('export{')), runtimeContext);
  const context = vm.createContext({ URL, TextEncoder, TextDecoder, structuredClone,
    e: runtimeContext.l, t: runtimeContext.s, n: runtimeContext.o });
  vm.runInContext(functions.join('\n'), context);
  function evaluate(code) {
    for (let i = 0; i < 1000; i++) {
      try { return vm.runInContext(code, context, { timeout: 1000 }); }
      catch (error) {
        const name = /^([\w$]+) is not defined$/.exec(error.message)?.[1];
        if (!name || !declarations.has(name)) throw error;
        evaluate(declarations.get(name));
      }
    }
    throw Error('Parser dependency limit');
  }
  evaluate('var parser=Ua().use(Qc).use(Xv).freeze()');
  return text => evaluate('parser.parse(' + JSON.stringify(text) + ')');
};
