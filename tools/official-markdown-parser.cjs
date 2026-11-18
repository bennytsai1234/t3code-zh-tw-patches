// Load only the official parser and its dependencies, without starting the browser UI.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const acorn = require('acorn');
const { readArchive } = require('./asarRewrite');

module.exports = function officialMarkdownParser() {
  const file = path.join(__dirname, '../builds/0.1.10/orig/server.asar');
  if (!fs.existsSync(file)) return null;
  const archive = readArchive(file);
  const entries = new Map(archive.files);
  const modules = new Map();
  function load(name) {
    if (modules.has(name)) return modules.get(name);
    const entry = entries.get(name);
    if (!entry) throw Error(`Missing parser dependency: ${name}`);
    const source = archive.read(entry).toString('utf8');
    const nodes = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module' }).body;
    const context = vm.createContext({ URL, TextEncoder, TextDecoder, structuredClone });
    const exports = new Map();
    const evaluate = code => vm.runInContext(code, context, { timeout: 5000 });
    const module = { evaluate, export: key => evaluate(exports.get(key)) };
    modules.set(name, module);
    function bind(local, get) {
      Object.defineProperty(context, local, {
        configurable: true,
        get() {
          const value = get();
          Object.defineProperty(context, local, { configurable: true, writable: true, value });
          return value;
        }
      });
    }
    for (const node of nodes) {
      if (node.type === 'FunctionDeclaration') evaluate(source.slice(node.start, node.end));
      if (node.type === 'ClassDeclaration') bind(node.id.name, () => evaluate('(' + source.slice(node.start, node.end) + ')'));
      if (node.type === 'VariableDeclaration') for (const item of node.declarations) {
        if (item.id.type === 'Identifier') bind(item.id.name, () => item.init && evaluate('(' + source.slice(item.init.start, item.init.end) + ')'));
      }
      if (node.type === 'ExportNamedDeclaration') for (const specifier of node.specifiers) {
        exports.set(specifier.exported.name, specifier.local.name);
      }
      if (node.type === 'ImportDeclaration') for (const specifier of node.specifiers) {
        if (specifier.type !== 'ImportSpecifier') continue;
        const dependency = path.posix.join(path.posix.dirname(name), node.source.value);
        bind(specifier.local.name, () => load(dependency).export(specifier.imported.name));
      }
    }
    return module;
  }
  const matches = [...entries.keys()].filter(name => /\/client\/assets\/useTimelineFollow-[^/]+\.js$/.test(name));
  if (matches.length !== 1) throw Error('Expected one timeline module');
  const { evaluate } = load(matches[0]);
  return text => evaluate('Sp.parse(' + JSON.stringify(text) + ')');
};
