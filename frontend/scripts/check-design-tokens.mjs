#!/usr/bin/env node
/**
 * GEN-17 guard: keeps the visual design consistent by making sure styles only use
 * the design tokens defined in the :root block of src/app/globals.css.
 *
 * Fails (exit 1) when, outside that :root block:
 *  - a CSS file uses a raw colour (#hex, rgb(), hsl()) or a raw font-size, font-weight,
 *    line-height, border-radius, box-shadow or z-index value;
 *  - a .ts/.tsx file contains a raw colour or an inline style that is not a token.
 * Run with `npm run lint` (also in CI).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const src = join(root, 'src');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/;
// Values allowed without a token: keywords, zero, percentages for circles, and calc()/var() built from tokens.
const SAFE_VALUE = /^(?:var\(--[\w-]+\)|calc\(.*var\(--.*\)|inherit|initial|unset|none|0|50%|1|normal|auto)$/;
const TOKEN_PROPS = ['font-size', 'font-weight', 'line-height', 'border-radius', 'box-shadow', 'z-index'];

const problems = [];

/** Blanks out the first :root { … } block (the token definitions) but keeps line numbers. */
function stripTokenBlock(css) {
  const start = css.indexOf(':root {');
  if (start === -1) return css;
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) {
      const block = css.slice(start, i + 1).replace(/[^\n]/g, ' ');
      return css.slice(0, start) + block + css.slice(i + 1);
    }
  }
  return css;
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
}

for (const file of walk(src)) {
  const rel = relative(root, file);
  const text = readFileSync(file, 'utf8');

  if (file.endsWith('.css')) {
    const lines = stripComments(stripTokenBlock(text)).split('\n');
    lines.forEach((line, i) => {
      if (COLOR.test(line)) problems.push(`${rel}:${i + 1} raw colour – use a --color-* token: ${line.trim()}`);
      const decl = line.match(/^\s*([a-z-]+)\s*:\s*(.+?);?\s*$/);
      if (decl && TOKEN_PROPS.includes(decl[1])) {
        const value = decl[2].replace(/;$/, '').trim();
        const parts = value.startsWith('calc(') ? [value] : value.split(/\s+/);
        if (!parts.every((part) => SAFE_VALUE.test(part))) problems.push(`${rel}:${i + 1} raw ${decl[1]} – use a design token: ${line.trim()}`);
      }
    });
  }

  if (/\.tsx?$/.test(file)) {
    const lines = stripComments(text).split('\n');
    lines.forEach((line, i) => {
      if (COLOR.test(line.replace(/href=["'][^"']*["']/g, ''))) {
        problems.push(`${rel}:${i + 1} raw colour in code – use a CSS class with tokens: ${line.trim()}`);
      }
      if (/style=\{\{/.test(line) && !/style=\{\{\s*[\w-]+:\s*[`'"]var\((?:--[\w-]+|\$\{\w+\})\)[`'"]\s*\}\}/.test(line)) {
        problems.push(`${rel}:${i + 1} inline style – use a CSS class (inline styles may only set one token): ${line.trim()}`);
      }
    });
  }
}

if (problems.length) {
  console.error(`Design token check failed (GEN-17):\n${problems.map((p) => `  ${p}`).join('\n')}`);
  process.exit(1);
}
console.log('Design token check passed (GEN-17).');
