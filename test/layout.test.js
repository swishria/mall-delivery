/**
 * 布局回归测试
 *
 * 背景:曾经出现过一个 bug —— 手机端滚到页面底部会看到本该隐藏的抽屉
 * (商品详情 / 确认下单 / 订单详情)。
 * 原因是抽屉用了 position:absolute,而外壳 .phone 是 min-height:100vh,
 * 在移动端浏览器里外壳会被内容撑高,absolute 的抽屉就跟着跑到文档流里。
 *
 * 这个测试不依赖浏览器:它把 index.html 里的 CSS 抠出来,断言那几条
 * 关键规则仍然是"固定在视口上"的写法。以后谁改回 absolute 就会红。
 *
 * 用法:node test/layout.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  [ok]   ' + name); }
  else {
    failed++;
    console.log('  [FAIL] ' + name + (extra !== undefined ? '  -> ' + extra : ''));
  }
}
function group(t) { console.log('\n' + t); }

/* ---------- 抠出 CSS ---------- */
const styleMatch = /<style[^>]*>([\s\S]*?)<\/style>/i.exec(html);
ok('能找到 <style> 块', !!styleMatch);
const css = styleMatch ? styleMatch[1] : '';

// 去掉注释,避免注释里的字影响判断
const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * 把所有规则摊平成 [{ sel, body, media }]。
 * 这样 html,body{...} 这种逗号组也能按单个选择器查到,
 * @media 里的规则也一并收进来(带 media 标记)。
 */
function parseRules(text, media) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    const brace = text.indexOf('{', i);
    if (brace < 0) break;
    // 找到与它配对的 }
    let depth = 0, end = -1;
    for (let j = brace; j < text.length; j++) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
    }
    if (end < 0) break;
    let sel = text.slice(i, brace).trim();
    const body = text.slice(brace + 1, end);

    // 处理 @media / @supports 嵌套
    const at = /^@(media|supports)\s*([^{]*)$/.exec(sel);
    if (at) {
      const label = (media ? media + ' && ' : '') + '@' + at[1] + ' ' + at[2].trim();
      parseRules(body, label).forEach(r => out.push(r));
    } else if (sel) {
      out.push({ sel, body, media: media || '' });
    }
    i = end + 1;
  }
  return out;
}

const RULES = parseRules(clean);

/**
 * 取某条规则在"默认(不在媒体查询里)"下的所有声明,拼在一起。
 * 为什么要拼:body 出现在两条规则里 —— 开头的 `html,body{margin:0;padding:0}`
 * 重置,和后面的 `body{...}` 主体。只取第一条会漏掉真正的内容。
 */
function ruleBody(selector) {
  const hits = RULES.filter(r =>
    !r.media.includes('@media') &&
    r.sel.split(',').map(s => s.trim()).includes(selector)
  );
  if (!hits.length) return null;
  return hits.map(h => h.body).join(';');
}

/** 取某条规则在某个媒体查询里的 body */
function ruleBodyIn(selector, mediaKeyword) {
  const hits = RULES.filter(r =>
    r.media.includes('@media') && r.media.includes(mediaKeyword) &&
    r.sel.split(',').map(s => s.trim()).includes(selector)
  );
  return hits.length ? hits.map(h => h.body).join(';') : null;
}

/* ---------------------------------------------------------------- */
group('1. 抽屉必须固定在视口上(核心回归点)');

const sheet = ruleBody('.sheet');
ok('.sheet 规则存在', sheet !== null);
if (sheet) {
  ok('.sheet 用 position:fixed(不能用 absolute)',
    /position\s*:\s*fixed/.test(sheet), sheet.slice(0, 120));
  ok('.sheet 初始状态被推出屏幕外', /translate\([^)]*102%/.test(sheet), sheet.match(/transform[^;]*/));
  ok('.sheet 有 max-height,避免超长内容撑出屏幕',
    /max-height\s*:\s*\d+vh/.test(sheet), sheet.match(/max-height[^;]*/));
  ok('.sheet 限制最大宽度,宽屏上不会铺满整屏',
    /max-width\s*:\s*430px/.test(sheet), sheet.match(/max-width[^;]*/));
}

const sheetOn = ruleBody('.sheet.on');
ok('.sheet.on 是滑入到位(transform 归零)', sheetOn !== null && /translate\([^)]*0\)/.test(sheetOn), sheetOn);

group('2. 遮罩也要固定');

const mask = ruleBody('.mask');
ok('.mask 规则存在', mask !== null);
if (mask) {
  ok('.mask 用 position:fixed', /position\s*:\s*fixed/.test(mask), mask.slice(0, 120));
  ok('.mask 默认不可点(pointer-events:none)', /pointer-events\s*:\s*none/.test(mask));
}
const maskOn = ruleBody('.mask.on');
ok('.mask.on 可点(pointer-events:auto)', maskOn !== null && /pointer-events\s*:\s*auto/.test(maskOn));

group('3. 购物车栏和提示条也要固定');

const cartbar = ruleBody('.cartbar');
ok('.cartbar 用 position:fixed', cartbar !== null && /position\s*:\s*fixed/.test(cartbar),
  cartbar && cartbar.slice(0, 100));

const toast = ruleBody('.toast');
ok('.toast 用 position:fixed', toast !== null && /position\s*:\s*fixed/.test(toast),
  toast && toast.slice(0, 100));

group('4. 页面外壳不该出现文档级滚动(移动端)');

const body = ruleBody('body');
ok('body 规则存在', body !== null);
if (body) {
  // 这是踩过的第二个坑:把 body 锁成 overflow:hidden、指望内部区域自己滚,
  // 结果移动端整个页面都滑不动了。页面自己滚才最稳,所以这里断言"没有锁死"。
  ok('body 没有被锁死(不能有 overflow:hidden)', !/overflow\s*:\s*hidden/.test(body), body.slice(0, 160));
  ok('body 没有固定高度(height:100%)', !/height\s*:\s*100%/.test(body), body.slice(0, 160));
}

const phone = ruleBody('.phone');
ok('.phone 规则存在', phone !== null);
if (phone) {
  // 移动端外壳由内容撑高,由页面滚动;固定高度会引出嵌套滚动问题
  ok('.phone 在移动端不锁高度(min-height 只在宽屏媒体查询里)',
    !/min-height\s*:\s*100/.test(phone), phone.match(/min-height[^;]*/) || '(无)');
  ok('.phone 在移动端不裁剪内容(overflow 只在宽屏媒体查询里)',
    !/overflow\s*:\s*hidden/.test(phone), phone.match(/overflow[^;]*/) || '(无)');
}

group('5. 宽屏上仍保留"手机外框"效果');

const wideBody = ruleBodyIn('body', 'min-width:520px');
const widePhone = ruleBodyIn('.phone', 'min-width:520px');
ok('存在 min-width:520px 下的 body 规则', wideBody !== null);
ok('存在 min-width:520px 下的 .phone 规则', widePhone !== null);
if (wideBody) {
  ok('宽屏上 body 有边距和底色', /padding/.test(wideBody) && /background/.test(wideBody), wideBody);
}
if (widePhone) {
  ok('宽屏上给外壳圆角', /border-radius/.test(widePhone), widePhone);
  ok('宽屏上外壳裁剪圆角(overflow:hidden)', /overflow\s*:\s*hidden/.test(widePhone), widePhone);
}

// 外壳本身在默认样式里就该限制宽度
ok('外壳默认就有 max-width:430px', phone !== null && /max-width\s*:\s*430px/.test(phone),
  phone && phone.match(/max-width[^;]*/));

group('6. 内容区交给页面滚动(不能在内部再套一层滚动)');

const scroll = ruleBody('.scroll');
ok('.scroll 规则存在', scroll !== null);
if (scroll) {
  ok('.scroll 用 flex:1', /flex\s*:\s*1/.test(scroll), scroll.slice(0, 120));
  // 嵌套滚动是移动端滑不动的主因,这里明确禁止
  ok('.scroll 没有 overflow-y:auto(不要嵌套滚动)',
    !/overflow-y\s*:\s*auto/.test(scroll), scroll.slice(0, 140));
  ok('.scroll 底部留了给购物车栏的余量', /padding-bottom|padding:/.test(scroll), scroll.slice(0, 140));
}

group('7. 结构完整性');

const divOpen = (html.match(/<div\b/g) || []).length;
const divClose = (html.match(/<\/div>/g) || []).length;
ok('div 开合数量相等', divOpen === divClose, `${divOpen} / ${divClose}`);

['sheetCart', 'sheetConfirm', 'sheetItem', 'sheetOrder'].forEach(id => {
  ok('存在抽屉 #' + id, html.includes('id="' + id + '"'));
});
ok('每个抽屉都带 class="sheet"',
  (html.match(/class="sheet"/g) || []).length === 4,
  (html.match(/class="sheet"/g) || []).length);

console.log('\n' + '='.repeat(48));
console.log('布局测试:通过 ' + passed + ' 项,失败 ' + failed + ' 项');
console.log('='.repeat(48));
process.exit(failed ? 1 : 0);
