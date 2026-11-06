import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

// Dependency-free host doubles keep the deterministic suite runnable without Pi.
const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const tui = dataUrl(`
export const Key = { up: 'up', down: 'down', enter: 'enter', escape: 'escape', space: 'space' };
export const matchesKey = (data, key) => data === key;
export const truncateToWidth = (text, width) => Array.from(text).slice(0, width).join('');
export const wrapTextWithAnsi = (text, width) => {
  const chars = Array.from(text), lines = [];
  for (let i = 0; i < chars.length; i += Math.max(1, width)) lines.push(chars.slice(i, i + Math.max(1, width)).join(''));
  return lines.length ? lines : [''];
};
export class Text { constructor(text) { this.text = text; } }
export class Editor {
  text = ''; focused = false;
  setText(text) { this.text = text; }
  invalidate() {}
  handleInput(data) { if (data === 'enter') this.onSubmit?.(this.text); else this.text += data; }
  render(width) { return [truncateToWidth(this.text, width)]; }
}
`);
const typebox = dataUrl(`
export const Type = {
  String: (options = {}) => ({ type: 'string', ...options }),
  Boolean: (options = {}) => ({ type: 'boolean', ...options }),
  Object: properties => ({ type: 'object', properties }),
  Array: (items, options = {}) => ({ type: 'array', items, ...options }),
  Optional: schema => schema,
};
`);
const modules = new Map();
async function load(url) {
  if (modules.has(url.href)) return modules.get(url.href);
  let source = stripTypeScriptTypes(await readFile(url, "utf8"));
  const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)];
  for (const [statement, specifier] of imports) {
    const resolved = specifier === "@earendil-works/pi-tui" ? tui
      : specifier === "typebox" ? typebox
      : specifier.endsWith(".ts") ? await load(new URL(specifier, url))
      : new URL(specifier, url).href;
    source = source.replace(statement, `from ${JSON.stringify(resolved)}`);
  }
  const result = dataUrl(source);
  modules.set(url.href, result);
  return result;
}
export async function loadTool() {
  const module = await import(await load(new URL("../../extensions/questions/index.ts", import.meta.url)));
  let tool;
  module.default({ registerTool(value) { tool = value; } });
  return tool;
}
export const tick = () => new Promise(resolve => setImmediate(resolve));
export function ui(mode = "tui") {
  let opens = 0, closes = 0, component;
  return {
    mode, hasUI: true,
    get opens() { return opens; },
    get closes() { return closes; },
    get component() { return component; },
    ui: { custom(factory) {
      opens++;
      return new Promise(resolve => {
        let closed = false;
        const done = value => {
          if (closed) return;
          closed = true;
          closes++;
          component?.dispose?.();
          resolve(value);
        };
        component = factory({ requestRender() {} }, { fg: (_color, text) => text, bold: text => text }, {}, done);
      });
    } },
  };
}
