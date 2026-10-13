/**
 * 楼里送 · 逻辑层测试
 * 跑法:node test/core.test.js
 * 不依赖任何测试框架,失败就打印 [FAIL] 并以非 0 退出。
 */
'use strict';

var C = require('../src/core.js');

var passed = 0, failed = 0;

function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  [ok]   ' + name); }
  else {
    failed++;
    console.log('  [FAIL] ' + name + (extra ? '  -> ' + JSON.stringify(extra) : ''));
  }
}

function eq(name, actual, expected) {
  var same = JSON.stringify(actual) === JSON.stringify(expected);
  ok(name, same, same ? null : { actual: actual, expected: expected });
}

function throws(name, fn, re) {
  var threw = false, msg = '';
  try { fn(); } catch (e) { threw = true; msg = e.message; }
  ok(name, threw && (!re || re.test(msg)), { threw: threw, msg: msg });
}

function group(title) { console.log('\n' + title); }

/* ---------------------------------------------------------------- */
group('1. 价格计算');

eq('单价 × 数量',
  C.lineSubtotal({ price: 4, qty: 3 }), 12);

eq('小数不飘(4.5 × 3)',
  C.lineSubtotal({ price: 4.5, qty: 3 }), 13.5);

eq('空行算 0',
  C.lineSubtotal({ price: undefined, qty: undefined }), 0);

eq('整单合计',
  C.calcTotal([
    { price: 4, qty: 2 },     // 8
    { price: 2.5, qty: 2 }    // 5
  ]).total, 13);

eq('有配送费时合计含配送费',
  C.calcTotal([{ price: 10, qty: 1 }], { deliveryFee: 3, freeAbove: 0 }).total, 13);

eq('满额免配送费',
  C.calcTotal([{ price: 10, qty: 1 }], { deliveryFee: 3, freeAbove: 10 }).total, 10);

eq('空单不算配送费',
  C.calcTotal([], { deliveryFee: 3 }).total, 0);

/* ---------------------------------------------------------------- */
group('2. 铺位号规范化');

eq('小写转大写', C.normalizeBooth('a12'), 'A12');
eq('纯数字补「号」', C.normalizeBooth('5'), '5号');
eq('去掉空格', C.normalizeBooth(' b 7 '), 'B7');
eq('空值返回空', C.normalizeBooth('   '), '');

/* ---------------------------------------------------------------- */
group('3. 下单校验');

var goodDraft = {
  floor: '5F',
  booth: 'a12',
  contact: '小王',
  phone: '13800001234',
  lines: [{ name: '冰红茶', qty: 2, price: 4, tags: ['冰'] }],
  note: '要两根吸管'
};

ok('合法草稿通过', C.validateDraft(goodDraft).ok);

ok('缺楼层被拦', !C.validateDraft(Object.assign({}, goodDraft, { floor: '' })).ok);

ok('缺铺位被拦', !C.validateDraft(Object.assign({}, goodDraft, { booth: '' })).ok);

ok('手机号格式错被拦',
  !C.validateDraft(Object.assign({}, goodDraft, { phone: '1380000' })).ok);

eq('一次报出所有问题(空单 + 缺铺位)',
  C.validateDraft({ floor: '3F', booth: '', contact: '', phone: '', lines: [] }).errors.length, 4);

ok('数量为 0 被拦',
  !C.validateDraft(Object.assign({}, goodDraft, { lines: [{ name: '可乐', qty: 0 }] })).ok);

ok('全是空名字的行不算商品',
  !C.validateDraft(Object.assign({}, goodDraft, { lines: [{ name: '  ', qty: 1 }] })).ok);

throws('非法草稿直接建单会抛错',
  function () { C.createOrder({ floor: '', lines: [] }); }, /不合法/);

/* ---------------------------------------------------------------- */
group('4. 状态机');

ok('待接单 -> 配送中 允许', C.canTransit('pending', 'delivering'));
ok('配送中 -> 已送达 允许', C.canTransit('delivering', 'delivered'));
ok('待接单 -> 已送达 禁止(不能跳步)', !C.canTransit('pending', 'delivered'));
ok('已送达 -> 配送中 禁止(不能回头)', !C.canTransit('delivered', 'delivering'));
ok('待接单 -> 已取消 允许', C.canTransit('pending', 'canceled'));
ok('配送中 -> 已取消 禁止(已经在路上了)', !C.canTransit('delivering', 'canceled'));
ok('已取消 -> 任何状态 禁止', !C.canTransit('canceled', 'pending'));
ok('未知状态 禁止', !C.canTransit('pending', 'weird'));

/* ---------------------------------------------------------------- */
group('5. 建单 & 流转 & 收款');

var store = C.createStore();
var o1 = store.place(goodDraft, { now: '2026-01-05T10:00:00', no: 'SD01050001' });

eq('单号', o1.no, 'SD01050001');
eq('初始状态', o1.status, 'pending');
eq('初始付款', o1.payment, 'unpaid');
eq('铺位已规范化', o1.booth, 'A12');
eq('手机号已清洗', o1.phone, '13800001234');
eq('参考价 = 4 × 2', o1.amount, 8);
eq('记录了 1 条日志', o1.logs.length, 1);

// 必须在「还是待接单」的时候测跳步,否则测的就不是跳步了
throws('待接单直接跳已送达会被拒绝',
  function () { store.advance(o1.id, 'delivered', {}); }, /不能从/);

var o1b = store.advance(o1.id, 'delivering', { now: '2026-01-05T10:05:00' });
eq('流转后状态', o1b.status, 'delivering');
eq('接了单时间', o1b.acceptedAt, '2026-01-05T10:05:00');
eq('日志 +1', o1b.logs.length, 2);

// 原订单对象不该被改动(不可变风格,方便以后接云数据库)
eq('原对象保持不变', store.get(o1.id).status, 'delivering');
ok('返回的是新对象,不是同一个引用', o1b !== o1);

var o1c = store.advance(o1.id, 'delivered', { now: '2026-01-05T10:20:00' });
eq('送达时间', o1c.deliveredAt, '2026-01-05T10:20:00');

var o1d = store.settle(o1.id, 'transfer', { now: '2026-01-05T10:21:00' });
eq('付款方式', o1d.payment, 'transfer');
eq('到账时间已记录', o1d.paidAt, '2026-01-05T10:21:00');
ok('已付转账算结清', C.SETTLED[o1d.payment] === true);

throws('乱传付款方式会抛错',
  function () { store.settle(o1.id, 'bitcoin'); }, /未知的付款方式/);

// 改金额
var o1e = store.setAmount(o1.id, 8.5, { now: '2026-01-05T10:22:00' });
eq('金额被覆盖', o1e.amount, 8.5);
ok('标记为被改过', o1e.amountEdited === true);

/* ---------------------------------------------------------------- */
group('6. 取消规则');

var o2 = store.place(goodDraft, { now: '2026-01-05T11:00:00' });
eq('第 2 单自动编号', o2.no, 'SD01050002');
var o2b = store.advance(o2.id, 'canceled', { now: '2026-01-05T11:01:00' });
eq('取消成功', o2b.status, 'canceled');

var o3 = store.place(goodDraft, { now: '2026-01-05T11:30:00' });
store.advance(o3.id, 'delivering', {});
throws('配送中的单不能取消',
  function () { store.advance(o3.id, 'canceled', {}); }, /不能从/);

/* ---------------------------------------------------------------- */
group('7. 订单查询');

eq('订单总数', store.all().length, 3);
// 此时三单分别是:已送达(o1)、已取消(o2)、配送中(o3) —— 没有待接单的
eq('待接单数量', store.byStatus('pending').length, 0);
eq('已送达数量', store.byStatus('delivered').length, 1);
eq('已取消数量', store.byStatus('canceled').length, 1);
eq('配送中数量', store.byStatus('delivering').length, 1);
ok('最新单排在最前', store.all()[0].no === 'SD01050003');
eq('按 id 取单', store.get(o2.id).no, 'SD01050002');
ok('取不存在的单返回 null', store.get('nope') === null);

/* ---------------------------------------------------------------- */
group('8. 挂账统计');

var creditStore = C.createStore();
// 3F A01 挂账 20,5F B02 挂账 9,5F B02 已付 10(不该算进挂账)
var c1 = creditStore.place({
  floor: '3F', booth: 'a01', contact: '奶茶店', phone: '13900000001',
  lines: [{ name: '矿泉水', qty: 10, price: 2 }]     // 20
}, { now: '2026-01-06T09:00:00' });
creditStore.settle(c1.id, 'credit');

var c2 = creditStore.place({
  floor: '5F', booth: 'b02', contact: '美甲店', phone: '13900000002',
  lines: [{ name: '薯片', qty: 1, price: 6 }, { name: '辣条', qty: 1, price: 3 }] // 9
}, { now: '2026-01-06T09:10:00' });
creditStore.settle(c2.id, 'credit');

var c3 = creditStore.place({
  floor: '5F', booth: 'b02', contact: '美甲店', phone: '13900000002',
  lines: [{ name: '打火机', qty: 5, price: 2 }]      // 10
}, { now: '2026-01-06T09:20:00' });
creditStore.settle(c3.id, 'cash');

var credits = creditStore.creditByBooth();
eq('只有 2 家欠钱', credits.length, 2);
eq('欠得多的排前面', credits[0].booth, '3F A01');
eq('3F A01 欠 20', credits[0].amount, 20);
eq('5F B02 欠 9(已付的那单不算)', credits[1].amount, 9);
eq('5F B02 只欠 1 单', credits[1].count, 1);

// 挂账还清后应该从名单消失
creditStore.settle(c2.id, 'transfer');
eq('还清后只剩 1 家', creditStore.creditByBooth().length, 1);

// 取消的单不算欠账
var c4 = creditStore.place({
  floor: '4F', booth: 'c03', contact: '服装店', phone: '13900000003',
  lines: [{ name: '雨衣', qty: 1, price: 12 }]
}, { now: '2026-01-06T09:30:00' });
creditStore.advance(c4.id, 'canceled', {});
eq('取消的单不进挂账名单', creditStore.creditByBooth().length, 1);

/* ---------------------------------------------------------------- */
group('9. 日报统计');

var statStore = C.createStore();
// 今天:两单送到(共 20 已付),一单待接单(8 未付),一单已取消(不算)
var s1 = statStore.place(goodDraft, { now: '2026-03-01T09:00:00' });   // 8
statStore.advance(s1.id, 'delivering', { now: '2026-03-01T09:05:00' });
statStore.advance(s1.id, 'delivered', { now: '2026-03-01T09:20:00' });
statStore.settle(s1.id, 'cash');

var s2 = statStore.place({
  floor: '4F', booth: 'd04', contact: '眼镜店', phone: '13700000001',
  lines: [{ name: '泡面', qty: 2, price: 6 }]   // 12
}, { now: '2026-03-01T10:00:00' });
statStore.advance(s2.id, 'delivering', { now: '2026-03-01T10:05:00' });
statStore.advance(s2.id, 'delivered', { now: '2026-03-01T10:15:00' });
statStore.settle(s2.id, 'transfer');

var s3 = statStore.place(goodDraft, { now: '2026-03-01T11:00:00' });   // 8 未付
var s4 = statStore.place(goodDraft, { now: '2026-03-01T12:00:00' });
statStore.advance(s4.id, 'canceled', {});

var today = C.dailyStats(statStore.all(), '2026-03-01');
eq('今天有效订单数(不含已取消)', today.orders, 3);
eq('已送达', today.delivered, 2);
eq('待接单', today.pending, 1);
eq('营业额 = 8 + 12 + 8', today.gmv, 28);
eq('已收 = 8 + 12', today.paidAmount, 20);
eq('未收 = 8', today.creditAmount, 8);
eq('欠款单数', today.creditOrders, 1);
eq('客单价 28 / 3', today.avgTicket, 9.33);

var other = C.dailyStats(statStore.all(), '2026-03-02');
eq('别的日期是空单', other.orders, 0);
eq('空日期营业额 0', other.gmv, 0);
eq('空日期客单价 0(不除零)', other.avgTicket, 0);

var tops = C.topItems(statStore.all(), 5);
// s1(8)、s3(8)、s4(8，已取消) 三单都点了 2 份冰红茶，共 6 份
ok('热销榜第一位是冰红茶(2×3=6 份)', tops[0].name === '冰红茶' && tops[0].qty === 6, tops);
eq('热销榜金额 = 4 × 6', tops[0].amount, 24);
ok('第二是泡面', tops[1].name === '泡面' && tops[1].qty === 2, tops);

/* ---------------------------------------------------------------- */
group('10. 顾客端视图');

var v = C.customerView(store.get(o1.id), '2026-01-05T10:30:00');
eq('送到哪', v.where, '5F A12');
eq('商品摘要', v.summary, '冰红茶×2(冰)');
eq('总件数', v.qty, 2);
eq('三步进度全部完成', v.steps.map(function (s) { return s.done; }), [true, true, true]);
ok('已送达不能取消', v.canCancel === false);
ok('已结清', v.settled === true);
eq('相对时间', v.since, '30 分钟前');

var v2 = C.customerView(store.get(o3.id), '2026-01-05T11:40:00');
ok('配送中的单也不能取消', v2.canCancel === false);
ok('配送中进度只亮两步',
  JSON.stringify(v2.steps.map(function (s) { return s.done; })) === JSON.stringify([true, true, false]));

var v3 = C.customerView(o2, '2026-01-05T11:05:00');
ok('待接单可以取消', v3.canCancel === true);

/* ---------------------------------------------------------------- */
group('11. 相对时间');

eq('刚刚', C.timeAgo('2026-01-01T10:00:00', '2026-01-01T10:00:30'), '刚刚');
eq('分钟', C.timeAgo('2026-01-01T10:00:00', '2026-01-01T10:05:00'), '5 分钟前');
eq('小时', C.timeAgo('2026-01-01T10:00:00', '2026-01-01T13:00:00'), '3 小时前');
eq('天', C.timeAgo('2026-01-01T10:00:00', '2026-01-03T10:00:00'), '2 天前');

/* ---------------------------------------------------------------- */
group('12. 单号生成');

eq('单号格式', C.orderNo(7, new Date(2026, 2, 9)), 'SD03090007');
eq('序号补零', C.orderNo(1234, new Date(2026, 10, 20)), 'SD11201234');

/* ---------------------------------------------------------------- */
group('13. 持久化钩子');

var saved = null;
var pStore = C.createStore({
  save: function (orders, seq) { saved = { count: orders.length, seq: seq }; }
});
pStore.place(goodDraft, {});
ok('下单会触发保存', saved && saved.count === 1 && saved.seq === 1);

var hStore = C.createStore();
hStore.hydrate(pStore.dump());
eq('重新加载后订单还在', hStore.all().length, 1);
eq('重新加载后序号延续', hStore.dump().seq, 1);

var h2 = C.createStore().hydrate(pStore.dump());
h2.place(goodDraft, {});
eq('续单号不重复', h2.all()[0].no !== h2.all()[1].no, true);

/* ---------------------------------------------------------------- */
group('14. 预设目录完整性');

ok('目录非空', C.CATALOG.length > 0);
ok('每个商品都有 id/名称/价格',
  C.CATALOG.every(function (p) {
    return p.id && p.name && typeof p.price === 'number' && p.price > 0;
  }));
var ids = C.CATALOG.map(function (p) { return p.id; });
eq('商品 id 不重复', ids.length, new Set(ids).size);
ok('目录里没有烟草类商品',
  !C.CATALOG.some(function (p) { return /烟|槟榔|电子烟/.test(p.name); }));

/* ---------------------------------------------------------------- */
console.log('\n' + '='.repeat(48));
console.log('通过 ' + passed + ' 项，失败 ' + failed + ' 项');
console.log('='.repeat(48));
process.exit(failed ? 1 : 0);
