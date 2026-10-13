/**
 * 楼里送 · 界面冒烟测试
 * 跑法:node test/smoke.js
 *
 * 思路:不靠浏览器。把 index.html 里那段真实的应用脚本取出来,
 * 在一个"假 DOM"里跑一遍,然后模拟点击,验证:
 *   1. 页面初始化不报错
 *   2. 商品网格真的渲染出商品
 *   3. 点"造几条假单"后,商家端真的渲染出订单和统计
 *   4. 购物篮的增删算钱是对的
 *   5. 换角色、切标签页都不炸
 * 这样能在真实开浏览器前,先把 90% 的低级错误挡掉。
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

var passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  [ok]   ' + name); }
  else {
    failed++;
    console.log('  [FAIL] ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''));
  }
}
function eq(name, a, b) { ok(name, JSON.stringify(a) === JSON.stringify(b), { actual: a, expected: b }); }
function group(t) { console.log('\n' + t); }

/* ============ 1. 把应用脚本抠出来 ============ */

function appScript() {
  var out = [];
  var pos = 0;
  while (true) {
    var open = html.indexOf('<script', pos);
    if (open < 0) break;
    var openEnd = html.indexOf('>', open);
    var close = html.indexOf('</script>', openEnd);
    if (close < 0) break;
    var tag = html.slice(open, openEnd);
    if (tag.indexOf('src=') < 0) out.push(html.slice(openEnd + 1, close));
    pos = close + 9;
  }
  return out;
}

var scripts = appScript();
ok('index.html 里找到了 2 段内联脚本', scripts.length === 2, scripts.length);
var MAIN = scripts[1];
ok('主脚本不是空的(说明抠取没被字符串里的 </div> 骗到)', MAIN.length > 5000, MAIN.length);

// 调试模式:在每个渲染函数调用后面插一个标记,用来判断哪些真的被执行了
if (process.env.SMOKE_DEBUG) {
  var fns = ['renderStats', 'renderOwe', 'renderTabs', 'renderOrders', 'renderTop',
             'renderCartBar', 'renderProducts', 'renderMyOrders', 'renderCartSheet'];
  var injected = 0;
  fns.forEach(function (fn) {
    var needle = fn + '();';
    var repl = fn + '(); document.getElementById(\'phone\').setAttribute(\'data-ran-' + fn + '\',\'1\');';
    if (MAIN.indexOf(needle) >= 0) { MAIN = MAIN.split(needle).join(repl); injected++; }
  });
  console.log('调试:注入标记 ' + injected + ' 处');

  // 在 renderOrders 写完 DOM 那一刻探一下长度
  var needle2 = "  function renderOrders() {\n    var box = $('orderList');\n    box.innerHTML = '';";
  if (MAIN.indexOf(needle2) < 0) {
    console.log('!! 探针2 注入失败:没找到 renderOrders 开头');
  } else {
    MAIN = MAIN.replace(needle2,
      "  function renderOrders() {\n    var box = $('orderList');\n" +
      "    if (window.__probe) window.__probe('HEAD boxIsOrderList=' + (box === document.getElementById('orderList')) + ' visible=' + visibleOrders().length);\n" +
      "    box.innerHTML = '';");
    // 在 box.appendChild(node) 之后探
    MAIN = MAIN.split("      box.appendChild(node);\n    });").join(
      "      box.appendChild(node);\n" +
      "      if (window.__probe) window.__probe('AFTER-APPEND len=' + box.innerHTML.length + ' children=' + box.children.length);\n" +
      "    });");
    // 在函数结尾探
    MAIN = MAIN.split("      box.appendChild(node);\n    });\n  }").join(
      "      box.appendChild(node);\n    });\n" +
      "    if (window.__probe) window.__probe('END len=' + box.innerHTML.length + ' nodeRef=' + (box === document.getElementById('orderList')));\n" +
      "  }");
  }
}

/* ============ 2. 假 DOM ============ */

function makeCtx() {
  var nodes = {};
  var all = [];

  function mk(tag) {
    var n = {
      tagName: String(tag || 'div').toUpperCase(),
      _html: '',
      children: [],
      _classes: {},
      style: {},
      attrs: {},
      value: '',
      _text: '',
      checked: false,
      onclick: null,
      onchange: null,
      oninput: null,
      onkeydown: null,
      title: ''
    };
    Object.defineProperty(n, 'textContent', {
      // 真 DOM 会把赋值强制转成字符串,这里也照做,免得测试比错类型
      get: function () { return n._text; },
      set: function (v) { n._text = String(v == null ? '' : v); }
    });
    Object.defineProperty(n, 'className', {
      get: function () { return Object.keys(n._classes).join(' '); },
      set: function (v) {
        n._classes = {};
        String(v || '').split(/\s+/).forEach(function (c) { if (c) n._classes[c] = true; });
      }
    });
    Object.defineProperty(n, 'innerHTML', {
      // 注意:真 DOM 里 appendChild 进去的子节点也是 innerHTML 的一部分。
      // 这里是假 DOM,getter 必须把子节点的内容也拼进来,否则断言会误判成"没渲染"。
      get: function () {
        if (!n.children.length) return n._html;
        var extra = '';
        n.children.forEach(function (c) {
          extra += (typeof c.__text === 'function') ? c.__text() : String(c.innerHTML || '');
        });
        return n._html + extra;
      },
      set: function (v) { n._html = String(v == null ? '' : v); n.children = []; }
    });
    n.classList = {
      add: function (c) { n._classes[c] = true; },
      remove: function (c) { delete n._classes[c]; },
      contains: function (c) { return !!n._classes[c]; },
      toggle: function (c, on) { if (on === undefined) on = !n._classes[c]; if (on) n._classes[c] = true; else delete n._classes[c]; }
    };
    n.appendChild = function (c) { n.children.push(c); all.push(c); return c; };
    n.setAttribute = function (k, v) { n.attrs[k] = String(v); };
    n.getAttribute = function (k) {
      if (k in n.attrs) return n.attrs[k];
      // 假 DOM 里没法真的解析子节点,就从自己的 innerHTML 里把同名 data-* 抓出来
      var re = new RegExp(k.replace(/[-]/g, '\\-') + '="([^"]*)"');
      var m = re.exec(n._html);
      return m ? m[1] : null;
    };
    n.querySelector = function (sel) {
      var m = /\[data-([a-zA-Z-]+)(?:="([^"]*)")?\]/.exec(String(sel));
      if (m) {
        var found = n.querySelectorAll(sel)[0];
        if (found) return found;
      }
      // 订单卡片要找它自己的 data-oid,告诉调用方这块 HTML 属于哪个订单
      var oid = /data-oid="([^"]+)"/.exec(n._html);
      var d = mk('div');
      if (oid) d.attrs['data-oid'] = oid[1];
      return d;
    };
    // 把 innerHTML 里出现过的 data-xxx="值" 变成"真的能找到的节点",这样点击能串起来。
    // 关键:同一个按钮必须每次返回同一个对象 —— 真 DOM 就是这样,
    // 否则页面挂上去的 onclick 会丢在另一个对象上,测试永远点不到。
    n._qsaCache = {};
    n.querySelectorAll = function (sel) {
      var m = /\[data-([a-zA-Z-]+)(?:="([^"]*)")?\]/.exec(String(sel));
      if (!m) return [];
      var attr = 'data-' + m[1], want = m[2];
      var key = attr + '=' + (want === undefined ? '*' : want);
      if (n._qsaCache[key]) return n._qsaCache[key];
      var hits = [];
      var re = new RegExp(attr + '(?:="([^"]*)")?', 'g'), g;
      while ((g = re.exec(n._html))) {
        if (want === undefined || g[1] === want) {
          var b = mk('button');
          b.attrs[attr] = g[1] === undefined ? '' : g[1];
          hits.push(b);
        }
      }
      n._qsaCache[key] = hits;
      return hits;
    };
    n.scrollIntoView = function () {};
    n.focus = function () {};
    n.remove = function () {};
    // 合并 innerHTML 里的文本 + 子节点里的文本,便于断言"渲染出了什么"
    n.__text = function () {
      var s = n._html;
      n.children.forEach(function (c) { s += ' ' + c.__text(); });
      return s;
    };
    return n;
  }

  // 从 HTML 里收集所有 id,建好元素(这样 $('x') 一定有东西,不会 null 崩)
  var idRe = /\sid="([^"]+)"/g, m;
  while ((m = idRe.exec(html))) {
    if (!nodes[m[1]]) { nodes[m[1]] = mk('div'); nodes[m[1]].id = m[1]; }
  }

  var document = {
    getElementById: function (id) { return nodes[id] || null; },
    createElement: mk,
    querySelectorAll: function () { return []; },
    querySelector: function (sel) {
      var mm = /\[data-oid="([^"]+)"\]/.exec(sel);
      if (mm) return nodes['__ord_' + mm[1]] || null;
      return mk('div');
    },
    body: mk('body'),
    documentElement: mk('html')
  };

  var store = {};
  var window = {
    document: document,
    localStorage: {
      getItem: function (k) { return k in store ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; }
    },
    addEventListener: function () {},
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: function () { return 0; },
    console: console,
    confirm: function () { return true; },
    AudioContext: null,
    webkitAudioContext: null,
    location: { href: 'file:///demo/index.html' }
  };
  window.window = window;

  return { nodes: nodes, all: all, document: document, window: window, store: store, mk: mk };
}

/* ============ 3. 跑起来 ============ */

var C = require('../src/core.js');
var ctx = makeCtx();
ctx.window.MallCore = C;
ctx.window.__probe = function (s) { console.log('    PROBE| ' + s); };

var sandbox = vm.createContext(ctx.window);
vm.runInContext('var window = this; var globalThis = this;', sandbox);

var loadErr = null;
try {
  vm.runInContext(MAIN, sandbox, { filename: 'index.html:inline' });
} catch (e) {
  loadErr = e;
}
group('1. 页面初始化');
ok('加载脚本没有抛异常', !loadErr, loadErr && (loadErr.message + '\n' + loadErr.stack));

if (loadErr) {
  console.log('\n初始化就挂了,后面的测试没意义,先修这个。');
  process.exit(1);
}

var $ = function (id) {
  var n = ctx.nodes[id];
  if (!n) throw new Error('测试里找不到元素 #' + id);
  return n;
};
var click = function (node, label) {
  try {
    if (!node || typeof node.onclick !== 'function') throw new Error('这个节点没有 onclick');
    node.onclick();
  } catch (e) {
    console.log('  [点击异常] ' + (label || '') + ' -> ' + e.message);
    console.log('    ' + String(e.stack).split('\n').slice(1, 4).join('\n    '));
    throw e;
  }
};

/* ============ 4. 顾客端初始渲染 ============ */

group('2. 顾客端首屏');

// 商品改成了紧凑列表: #prodGrid > .plist > 若干 .prow,默认只显示 PROD_PAGE 个
function productRows() {
  var wrap = $('prodGrid').children[0];
  return (wrap && wrap.children) ? wrap.children : [];
}

eq('商品列表默认只渲染 7 行(其余的收起来,保证一屏放得下)', productRows().length, 7);
ok('有「展开看看」按钮', $('prodGrid').children.length === 2 &&
  String($('prodGrid').children[1].className).indexOf('morebtn') >= 0,
  $('prodGrid').children.map(function (c) { return c.className; }).join(' | '));
ok('第一行是冰红茶', productRows()[0] && productRows()[0].innerHTML.indexOf('冰红茶') >= 0,
  productRows()[0] && productRows()[0].innerHTML.slice(0, 80));
ok('行里有价格 4.00', productRows()[0].innerHTML.indexOf('4.00') >= 0);
ok('分类条渲染出来了', $('catBar').children.length >= 5, $('catBar').children.length);
ok('快捷标签渲染出来了', $('quickTags').children.length === C.QUICK_TAGS.length);
ok('楼层下拉有 4 个选项', $('cFloor').children.length === 4, $('cFloor').children.length);
ok('空篮子时购物车栏是隐藏的', $('cartBar').classList.contains('hide'));
ok('没有订单时显示空态', $('myOrders').__text().indexOf('还没有订单') >= 0,
  $('myOrders').__text().slice(0, 80));

group('2.5 地址区默认收起,省一屏空间');

ok('地址摘要是显示状态', $('addrBar').style.display === 'flex', $('addrBar').style.display);
ok('地址表单是隐藏状态', $('addrForm').style.display === 'none', $('addrForm').style.display);
ok('摘要文案有内容', String($('addrNow').textContent).length > 0, $('addrNow').textContent);

group('2.6 展开 / 收起商品列表');

$('prodGrid').children[1].onclick();
eq('展开后显示全部商品', productRows().length, C.CATALOG.length);
ok('展开后按钮变成「收起」', $('prodGrid').children[1].innerHTML.indexOf('收起') >= 0);
$('prodGrid').children[1].onclick();
eq('再点一次收回 7 行', productRows().length, 7);

/* ============ 5. 加入购物篮 ============ */

group('3. 加东西进篮子');

// 点第一行商品 → 打开商品抽屉
click(productRows()[0]);
ok('点商品会打开抽屉', $('sheetItem').classList.contains('on'));
eq('抽屉标题是商品名', $('itTitle').textContent, '冰红茶');
eq('抽屉初始数量', $('itQty').textContent, '1');

// 数量 +1,再加进篮子
click($('itPlus'));
eq('加一件后数量变 2', $('itQty').textContent, '2');
click($('btnItAdd'));

ok('加完抽屉关掉了', !$('sheetItem').classList.contains('on'));
ok('购物车栏显示出来了', !$('cartBar').classList.contains('hide'));
eq('篮子件数', $('cartCount').textContent, '2');
eq('篮子金额 4×2', $('cartTotal').textContent, '¥8.00');
ok('篮子里有冰红茶', $('cartBody').__text().indexOf('冰红茶') >= 0);

// 再加一个不同商品(列表第二行是可乐 ¥4)
click(productRows()[1]);
click($('btnItAdd'));
eq('两样东西共 3 件', $('cartCount').textContent, '3');
eq('合计 8 + 4', $('cartTotal').textContent, '¥12.00');

// 再点同一样,数量应该累加
click(productRows()[1]);
click($('btnItAdd'));
eq('又加一件可乐 → 4 件', $('cartCount').textContent, '4');
eq('金额 8+4+4', $('cartTotal').textContent, '¥16.00');

/* ============ 6. 自己打字加东西 ============ */

group('4. 自己打字(不要商品页的用法)');

$('cCustom').value = '创可贴';
click($('btnCustom'));
// 同一件商品再加一次会合并成一行,但件数继续累加 → 6 件
eq('自定义商品也进篮子(累计 5 件)', $('cartCount').textContent, '5');
eq('自定义商品价格 0,总额不变', $('cartTotal').textContent, '¥16.00');
ok('输入框被清空', $('cCustom').value === '', $('cCustom').value);
ok('篮子里有"创可贴"', $('cartBody').__text().indexOf('创可贴') >= 0);
ok('创可贴标了 0 元(等店家填价)',
  $('cartBody').__text().indexOf('¥0.00') >= 0 || $('cartBody').__text().indexOf('0.00') >= 0);

/* ============ 7. 下单校验 ============ */

group('5. 下单校验(该拦的要拦住)');

click($('btnCheckout'));
ok('打开确认抽屉', $('sheetConfirm').classList.contains('on'));

// 故意不填铺位和手机号
$('cBooth').value = '';
$('cfContact').value = '';
$('cfPhone').value = '';
click($('btnPlace'));
ok('缺信息时不放行,给出错误', $('cfErr').textContent.length > 0, $('cfErr').textContent);
ok('订单没有真的建出来', C.createStore().hydrate(JSON.parse(ctx.store['mallDelivery.v1'] || '{"orders":[]}')).all().length === 0);

// 填对
$('cBooth').value = 'a12';
$('cfContact').value = '美甲店 小周';
$('cfPhone').value = '13800001111';
$('cfWhen').value = 'asap';
click($('btnPlace'));

var saved = JSON.parse(ctx.store['mallDelivery.v1']);
eq('真的建出 1 单', saved.orders.length, 1);
eq('铺位号被规范化', saved.orders[0].booth, 'A12');
eq('楼层带上了', saved.orders[0].floor, '5F');
eq('手机号清洗过', saved.orders[0].phone, '13800001111');
eq('初始状态是待接单', saved.orders[0].status, 'pending');
eq('金额 = 8 + 4 + 4 + 0(创可贴 0 元)', saved.orders[0].amount, 16);
// 矿泉水加了两次会和上一行合并成一行,所以是 3 行:冰红茶 / 矿泉水 / 创可贴
eq('3 行商品(创可贴 0 元,可乐合并成一行)', saved.orders[0].lines.length, 3);
ok('有一行是 0 元的自写商品',
  saved.orders[0].lines.some(function (l) { return l.name === '创可贴' && l.price === 0; }),
  saved.orders[0].lines.map(function (l) { return l.name + ':' + l.price; }));
ok('确认抽屉关掉了', !$('sheetConfirm').classList.contains('on'));

group('6. 下单后篮子清空、我的订单出现');

ok('篮子清空了', $('cartBar').classList.contains('hide'));
ok('我的订单里有这一单', $('myOrders').__text().indexOf('A12') >= 0, $('myOrders').__text().slice(0, 120));
ok('显示"待接单"', $('myOrders').__text().indexOf('待接单') >= 0);
ok('显示"未付款"', $('myOrders').__text().indexOf('未付款') >= 0);

/* ============ 8. 商家端 ============ */

group('7. 切换到商家端');

click($('roleMerch'));

if (process.env.SMOKE_DEBUG) {
  console.log('\n----- DEBUG -----');
  var phoneNode = $('phone');
  ['renderStats', 'renderOwe', 'renderTabs', 'renderOrders', 'renderTop',
   'renderCartBar', 'renderProducts', 'renderMyOrders', 'renderCartSheet'].forEach(function (fn) {
    console.log('  ' + fn + ' 跑过: ' + (phoneNode.getAttribute('data-ran-' + fn) === '1'));
  });
  console.log('  orderList 长度 = ' + $('orderList').innerHTML.length);
  console.log('  oid 索引节点:', Object.keys(ctx.nodes).filter(function (k) { return k.indexOf('__ord_') === 0; }).length);
  console.log('----- END DEBUG -----\n');
}

eq('顾客端藏起来', $('viewCust').style.display, 'none');
ok('商家端显示出来', $('viewMerch').style.display !== 'none');
ok('统计卡片有内容', $('statGrid').innerHTML.indexOf('待接单') >= 0);
ok('统计里营业额是 ¥16.00', $('statGrid').innerHTML.indexOf('16.00') >= 0);
ok('订单列表里有那一单', $('orderList').__text().indexOf('A12') >= 0, $('orderList').__text().slice(0, 100));
ok('订单卡片上有"接单,去送"', $('orderList').__text().indexOf('接单') >= 0);
ok('订单卡片上有"未付款"标记', $('orderList').__text().indexOf('未付款') >= 0);
ok('订单卡片上有 4 个付款方式按钮', $('orderList').__text().indexOf('已付现金') >= 0 &&
  $('orderList').__text().indexOf('挂账') >= 0);
ok('欠账区列出这个铺位还欠着钱',
  $('oweBox').__text().indexOf('5F A12') >= 0 && $('oweBox').__text().indexOf('¥') >= 0,
  $('oweBox').__text().slice(0, 120));
ok('热销区渲染了', $('topBox').__text().indexOf('冰红茶') >= 0, $('topBox').__text().slice(0, 80));

group('7.5 真的点一次"接单,去送"');

// 找到那张待接单的卡片,点它上面的"接单,去送"按钮
(function () {
  var o = JSON.parse(ctx.store['mallDelivery.v1']).orders
    .filter(function (x) { return x.status === 'pending'; })[0];
  ok('有单可接', !!o);
  if (!o) return;

  var card = null;
  $('orderList').children.forEach(function (c) {
    if (c.getAttribute && c.getAttribute('data-oid') === o.id) card = c;
  });
  ok('在列表里找到了这张卡片', !!card);
  if (!card) return;

  var doBtn = card.querySelectorAll('[data-act]').filter(function (b) {
    return b.getAttribute('data-act') === 'delivering';
  })[0];
  ok('卡片上有"接单"按钮', !!doBtn);
  if (!doBtn) return;

  // 点标签的工具(页面把 tab 按钮的点击挂在 onclick 上)
  var toTab = function (name) {
    $('orderTabs').children.forEach(function (b) {
      if (String(b.innerHTML).indexOf(name) >= 0 && typeof b.onclick === 'function') b.onclick();
    });
  };

  click(doBtn);
  var after = JSON.parse(ctx.store['mallDelivery.v1']).orders
    .filter(function (x) { return x.id === o.id; })[0];
  eq('点完之后状态变成配送中', after.status, 'delivering');
  ok('记录了接单时间', !!after.acceptedAt);
  ok('日志里多了"配送中"', after.logs.some(function (g) { return g.text.indexOf('配送中') >= 0; }));

  // 接单之后这单就从"待接单"挪到"配送中"了,要切标签才看得到
  toTab('配送中');
  ok('切到"配送中"标签', $('orderList').__text().indexOf('A12') >= 0, $('orderList').__text().slice(0, 80));
  ok('这一单现在显示"送到了"按钮', $('orderList').__text().indexOf('送到了') >= 0);

  // 再点"送到了"
  var card2 = null;
  $('orderList').children.forEach(function (c) {
    if (c.getAttribute && c.getAttribute('data-oid') === o.id) card2 = c;
  });
  ok('在"配送中"里找到这张卡片', !!card2);
  var doneBtn = card2 && card2.querySelectorAll('[data-act]').filter(function (b) {
    return b.getAttribute('data-act') === 'delivered';
  })[0];
  ok('找到"送到了"按钮', !!doneBtn);
  if (doneBtn) {
    click(doneBtn);
    var after2 = JSON.parse(ctx.store['mallDelivery.v1']).orders
      .filter(function (x) { return x.id === o.id; })[0];
    eq('点完变已送达', after2.status, 'delivered');
    ok('记录了送达时间', !!after2.deliveredAt);
  }

  // 标记收款(去"全部"标签找,这时它已经到"已送达"了)
  toTab('全部');
  var card3 = null;
  $('orderList').children.forEach(function (c) {
    if (c.getAttribute && c.getAttribute('data-oid') === o.id) card3 = c;
  });
  ok('在"全部"里找到这张卡片', !!card3);
  var payBtn = card3 && card3.querySelectorAll('[data-pay]').filter(function (b) {
    return b.getAttribute('data-pay') === 'transfer';
  })[0];
  ok('找到"已付转账"按钮', !!payBtn);
  if (payBtn) {
    click(payBtn);
    var after3 = JSON.parse(ctx.store['mallDelivery.v1']).orders
      .filter(function (x) { return x.id === o.id; })[0];
    eq('付款状态变成已付转账', after3.payment, 'transfer');
    ok('记录到账时间', !!after3.paidAt);
  }
})();

group('8. 造假单');
click($('btnSeed'));
var saved2 = JSON.parse(ctx.store['mallDelivery.v1']);
eq('变成 6 单(1 真 + 5 假)', saved2.orders.length, 6);
ok('有已送达的单', saved2.orders.some(function (o) { return o.status === 'delivered'; }));
ok('有配送中的单', saved2.orders.some(function (o) { return o.status === 'delivering'; }));
ok('有挂账的单', saved2.orders.some(function (o) { return o.payment === 'credit'; }));
ok('欠账区列出了欠钱的人', $('oweBox').__text().indexOf('¥') >= 0 || $('oweBox').__text().indexOf('✅') >= 0,
  $('oweBox').__text().slice(0, 100));
ok('热销榜有内容', $('topBox').__text().indexOf('件') >= 0, $('topBox').__text().slice(0, 100));
ok('假单不是同一时刻下的', (function () {
  var t = saved2.orders.map(function (o) { return o.createdAt; });
  return new Set(t).size > 1;
})());

group('9. 切标签页');

var tabs = ['pending', 'delivering', 'delivered', 'owe', 'all'];
var tabErr = null;
try {
  tabs.forEach(function (t) {
    // 从 tabs 里找到对应按钮并点
    var btn = null;
    $('orderTabs').children.forEach(function (b) {
      if (b.innerHTML.indexOf({ pending: '待接单', delivering: '配送中', delivered: '已送达', owe: '没给钱', all: '全部' }[t]) >= 0) btn = b;
    });
    if (btn && btn.onclick) btn.onclick();
  });
} catch (e) { tabErr = e; }
ok('五个标签页轮着点都不报错', !tabErr, tabErr && tabErr.message);
ok('标签数量是 5', $('orderTabs').children.length === 5, $('orderTabs').children.length);
ok('待接单标签上有红色角标(有单时)', $('orderTabs').__text().indexOf('待接单') >= 0,
  $('orderTabs').__text().slice(0, 80));

group('10. 再切回顾客端');

var backErr = null;
try { click($('roleCust')); } catch (e) { backErr = e; }
ok('切回顾客端不报错', !backErr, backErr && backErr.message);
ok('顾客端显示了 6 单', $('myOrders').children.length === 6, $('myOrders').children.length);
ok('常去铺位出现快捷按钮', $('boothChips').children.length > 0, $('boothChips').children.length);

group('11. 清空');

click($('btnReset'));
var saved3 = JSON.parse(ctx.store['mallDelivery.v1']);
eq('清空后 0 单', saved3.orders.length, 0);
eq('清空后序号归零', saved3.seq, 0);

/* ============ 9. 结果 ============ */

console.log('\n' + '='.repeat(48));
console.log('冒烟测试:通过 ' + passed + ' 项,失败 ' + failed + ' 项');
console.log('='.repeat(48));
process.exit(failed ? 1 : 0);
