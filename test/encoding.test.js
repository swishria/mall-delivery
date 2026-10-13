/**
 * 编码守卫测试
 *
 * 背景:曾经用 PowerShell 的 Get-Content / Set-Content 去改 index.html,
 * 结果整份文件的中文全变成乱码(输入绑定 -> 杈撳叆缁戝畾)。
 * 原因是 Windows PowerShell 5.1 默认按 GBK 读文件,UTF-8 的内容被读坏了,
 * 再写回去就是双重编码。这个错误很隐蔽 —— 页面还能打开,只是满屏乱码。
 *
 * 这个测试检查:
 *   1. 没有 UTF-8 BOM(浏览器和 git 都更喜欢没有 BOM)
 *   2. 文件是合法的 UTF-8(没有非法字节序列)
 *   3. 关键中文文案都在
 *   4. 没有典型的"UTF-8 被当 GBK 读"的乱码特征
 *
 * 用法:node test/encoding.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILES = ['index.html', 'src/core.js', 'README.md'];

let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  [ok]   ' + name); }
  else {
    failed++;
    console.log('  [FAIL] ' + name + (extra !== undefined ? '  -> ' + extra : ''));
  }
}
function group(t) { console.log('\n' + t); }

// "UTF-8 被当成 GBK 解码"之后最常出现的乱码片段
// (例如 输入->杈撳叆,绑定->缁戝畾,楼里送->妤奸€佺)
const MOJIBAKE = [
  '杈撳叆', '缁戝畾', '妤奸', '濂藉', '鍟嗗', '璁㈠崟', '鑿滃崟',
  '娴嬭瘯', '閲嶅', '\uFFFD'   // \uFFFD 是替换字符,说明有非法字节
];

FILES.forEach(file => {
  group('检查 ' + file);

  const full = path.join(ROOT, file);
  ok('文件存在', fs.existsSync(full));
  if (!fs.existsSync(full)) return;

  const buf = fs.readFileSync(full);

  // 1. BOM
  const hasBom = buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
  ok('没有 UTF-8 BOM', !hasBom, hasBom ? '文件开头有 EF BB BF' : '');

  // 2. 合法 UTF-8:用宽松解码再严格解码,对比是否一致
  const strict = new TextDecoder('utf-8', { fatal: true });
  let text = null, decodeErr = null;
  try { text = strict.decode(buf); } catch (e) { decodeErr = e.message; }
  ok('是合法的 UTF-8', decodeErr === null, decodeErr || '');

  if (text === null) return;

  // 3. 乱码特征
  const found = MOJIBAKE.filter(m => text.includes(m));
  ok('没有典型乱码片段', found.length === 0, found.join(', ') || '');

  // 4. 中文密度:一个中文都没有说明肯定出问题了
  const cn = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  ok('含中文(说明没被清空或转义)', cn > 40, '中文字符数 = ' + cn);
});

group('关键中文文案是否都在(防止被静默改坏)');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const MUST = [
  '楼里送',            // 标题
  '送到哪儿',          // 顾客端区块
  '来点什么',
  '还没有填过位置',    // 地址摘要默认文案
  '展开看看',          // 商品列表展开按钮
  '待接单',            // 商家端状态
  '挂账',
  '冰红茶',            // 示例商品名
  '创可贴'
];
MUST.forEach(s => ok('index.html 里有「' + s + '」', html.includes(s)));

const core = fs.readFileSync(path.join(ROOT, 'src/core.js'), 'utf8');
['冰红茶', '待接单', '挂账', '已送达'].forEach(s => {
  ok('src/core.js 里有「' + s + '」', core.includes(s));
});

console.log('\n' + '='.repeat(48));
console.log('编码测试:通过 ' + passed + ' 项,失败 ' + failed + ' 项');
console.log('='.repeat(48));
process.exit(failed ? 1 : 0);
