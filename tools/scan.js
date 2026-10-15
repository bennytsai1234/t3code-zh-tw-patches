// Scan client bundle for string literals and classify their syntactic context.
const fs = require("fs");
const path = require("path");
const acorn = require("acorn");
const walk = require("acorn-walk");

function keyName(k) {
  if (!k) return "?";
  if (k.type === "Identifier") return k.name;
  if (k.type === "Literal") return String(k.value);
  if (k.type === "TemplateLiteral" && k.expressions.length === 0) return k.quasis[0].value.cooked;
  return "?";
}

function calleeName(c) {
  if (c.type === "Identifier") return c.name;
  if (c.type === "MemberExpression") return (c.object.type === "Identifier" ? c.object.name : "_") + "." + keyName(c.property);
  if (c.type === "SequenceExpression") return calleeName(c.expressions[c.expressions.length - 1]);
  return c.type;
}

// Walk up through value-passing wrappers and describe where the string ends up.
function contextOf(ancestors, node) {
  let child = node;
  const via = [];
  for (let i = ancestors.length - 2; i >= 0; i--) {
    const p = ancestors[i];
    switch (p.type) {
      case "ConditionalExpression":
        if (p.test === child) return { ctx: "test", via };
        via.push("?:");
        break;
      case "LogicalExpression":
        via.push(p.operator);
        break;
      case "ArrayExpression":
        via.push("[]");
        break;
      case "SequenceExpression":
        if (p.expressions[p.expressions.length - 1] !== child) return { ctx: "seq", via };
        via.push(",");
        break;
      case "TemplateLiteral":
        return { ctx: "tplexpr", via };
      case "Property":
        if (p.key === child) return { ctx: p.computed ? "ckey" : "key", via };
        return { ctx: "prop:" + keyName(p.key), via };
      case "BinaryExpression":
        return { ctx: "bin:" + p.operator, via };
      case "SwitchCase":
        return { ctx: "case", via };
      case "CallExpression":
      case "NewExpression":
        if (p.callee === child) return { ctx: "callee", via };
        return { ctx: "call:" + calleeName(p.callee) + "#" + p.arguments.indexOf(child), via };
      case "SpreadElement":
        via.push("...");
        break;
      case "MemberExpression":
        // [...lines].join("\n") is how confirm dialogs build their message.
        if (p.object === child && via.includes("[]") && keyName(p.property) === "join") return { ctx: "join", via };
        return { ctx: p.property === child ? "member" : "memberobj", via };
      case "VariableDeclarator":
        return { ctx: "var", via };
      case "AssignmentExpression":
        if (p.left.type === "MemberExpression") return { ctx: "assign:" + keyName(p.left.property), via };
        return { ctx: "assign", via };
      case "ReturnStatement":
        return { ctx: "return", via };
      case "ArrowFunctionExpression":
        return { ctx: "arrow", via };
      case "AssignmentPattern":
        return { ctx: "default", via };
      case "TaggedTemplateExpression":
        return { ctx: "tagged", via };
      case "ExpressionStatement":
        return { ctx: "stmt", via };
      default:
        return { ctx: p.type, via };
    }
    child = p;
  }
  return { ctx: "top", via };
}

function strValue(node) {
  if (node.type === "Literal") return typeof node.value === "string" ? node.value : null;
  // Template literal: placeholders become {0}, {1}, ...
  let s = "";
  node.quasis.forEach((q, i) => {
    s += q.value.cooked ?? q.value.raw;
    if (i < node.expressions.length) s += "{" + i + "}";
  });
  return s;
}

function scanFile(file, onString) {
  const src = fs.readFileSync(file, "utf8");
  let ast;
  try {
    ast = acorn.parse(src, { ecmaVersion: "latest", sourceType: "module", allowHashBang: true });
  } catch (e) {
    try {
      ast = acorn.parse(src, { ecmaVersion: "latest", sourceType: "script", allowHashBang: true });
    } catch (e2) {
      console.error("PARSE FAIL", file, e2.message);
      return;
    }
  }
  walk.fullAncestor(ast, (node, _state, ancestors) => {
    if (node.type !== "Literal" && node.type !== "TemplateLiteral") return;
    if (node.type === "TemplateLiteral") {
      const p = ancestors[ancestors.length - 2];
      if (p && p.type === "TaggedTemplateExpression") return;
    }
    const v = strValue(node);
    if (v == null) return;
    onString({ node, value: v, ...contextOf(ancestors, node), src });
  });
}

module.exports = { scanFile, strValue, contextOf };
