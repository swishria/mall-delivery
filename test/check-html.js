/**
 * 检查 index.html 里 HTML 标签的嵌套是否真的配对。
 *
 * 为什么需要它:
 *   只数 <div> 和 </div> 的个数是不够的 —— 数量相等但嵌套错了,
 *   浏览器会"自动修正",结果就是元素跑到意想不到的位置
 *   (我们这个 bug 就是抽屉漏到文档流里了)。
 *
 * 用法:node test/check-html.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'index.html');
const raw = fs.readFileSync(file, 'utf8');

// 1. 把 <script> 和 <style> 的内容挖掉,免得里面的字符串/注释干扰
const cleaned = raw
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '<script></script>')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '<style></style>')
  .replace(/<!--[\s\S]*?-->/g, '');

// 2. 自闭合 / 空元素
const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

const lines = cleaned.split('\n');

// 3. 逐个标签扫,维护一个栈
const stack = [];
const problems = [];
let line = 1, last = 0;

const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
let m;
while ((m = re.exec(cleaned)) !== null) {
  line += (cleaned.slice(last, m.index).match(/\n/g) || []).length;
  last = m.index;

  const isClose = m[1] === '/';
  const tag = m[2].toLowerCase();
  const selfClosed = m[4] === '/';
  if (VOID.has(tag) || selfClosed) continue;

  if (!isClose) {
    stack.push({ tag, line });
  } else {
    // 从栈顶往下找匹配的
    let i = stack.length - 1;
    while (i >= 0 && stack[i].tag !== tag) i--;

    if (i < 0) {
      problems.push({ kind: 'stray-close', tag, line });
    } else {
      const orphans = stack.slice(i + 1);
      orphans.forEach(o => problems.push({ kind: 'unclosed', tag: o.tag, line: o.line, closedBy: tag, closedAt: line }));
      stack.length = i;
    }
  }
}
stack.forEach(o => problems.push({ kind: 'never-closed', tag: o.tag, line: o.line }));

// 4. 报告
if (!problems.length) {
  console.log('  [ok]   HTML 标签嵌套完全正确');
  process.exit(0);
}

console.log('  发现 ' + problems.length + ' 处嵌套问题:');
problems.slice(0, 20).forEach(p => {
  if (p.kind === 'stray-close') {
    console.log(`   [多余闭合] 第 ${p.line} 行的 </${p.tag}>,但栈里没有对应的开标签`);
  } else if (p.kind === 'unclosed') {
    console.log(`   [未闭合]   第 ${p.line} 行的 <${p.tag}> 一直没关,直到第 ${p.closedAt} 行遇到 </${p.closedBy}> 才被迫收尾`);
  } else {
    console.log(`   [始终未闭合] 第 ${p.line} 行的 <${p.tag}>`);
  }
});
if (problems.length > 20) console.log('   ...还有 ' + (problems.length - 20) + ' 处');
console.log('\n  上下文(第一个问题附近):');
const first = problems[0];
for (let i = Math.max(0, first.line - 4); i < Math.min(lines.length, first.line + 3); i++) {
  console.log(`   ${String(i + 1).padStart(4)}| ${lines[i]}`);
}
process.exit(1);
