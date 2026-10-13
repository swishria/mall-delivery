/*!
 * 楼里送 · 核心逻辑
 * 商场便利店「楼内送货」下单系统的纯逻辑层。
 * 不依赖任何运行时:浏览器里当 window.MallCore,Node 里当 require('./core.js')。
 *
 * 设计要点:
 *  - 商品由输入框 + 预设目录混合产生(顾客可以打任何字,也可以点预设)
 *  - 订单状态机单向流转,不允许跳步
 *  - 结算状态(未付/已付/挂账)独立于配送状态
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MallCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ============================ 常量 ============================ */

  // 楼层
  var FLOORS = ['3F', '4F', '5F', '6F'];

  // 配送状态机:单向,不可跳步
  var FLOW = ['pending', 'delivering', 'delivered'];

  var STATUS_TEXT = {
    pending: '待接单',
    delivering: '配送中',
    delivered: '已送达',
    canceled: '已取消'
  };

  var PAY_TEXT = {
    unpaid: '未付款',
    cash: '已付现金',
    transfer: '已付转账',
    credit: '挂账'
  };

  // 挂账算作「这次没收钱」,其它都算已结清
  var SETTLED = { cash: true, transfer: true, unpaid: false, credit: false };

  // 预设商品目录:顾客可以点,也可以完全不打字自己写。
  // 品类刻意选了便利店最常见的非烟商品(这个 Demo 不碰烟草)。
  var CATALOG = [
    { id: 'p01', name: '冰红茶', spec: '500ml', price: 4, cat: '饮料', hot: true },
    { id: 'p02', name: '可乐', spec: '500ml', price: 4, cat: '饮料', hot: true },
    { id: 'p03', name: '无糖可乐', spec: '500ml', price: 4.5, cat: '饮料' },
    { id: 'p04', name: '雪碧', spec: '500ml', price: 4, cat: '饮料' },
    { id: 'p05', name: '矿泉水', spec: '550ml', price: 2, cat: '饮料', hot: true },
    { id: 'p06', name: '东方树叶', spec: '500ml', price: 5, cat: '饮料' },
    { id: 'p07', name: '美式咖啡', spec: '冰/热', price: 8, cat: '饮料' },
    { id: 'p08', name: '红牛', spec: '250ml', price: 6, cat: '饮料' },
    { id: 'p09', name: '旺仔牛奶', spec: '245ml', price: 5, cat: '饮料' },
    { id: 'p10', name: '薯片', spec: '大包', price: 6, cat: '零食', hot: true },
    { id: 'p11', name: '辣条', spec: '小包', price: 3, cat: '零食' },
    { id: 'p12', name: '口香糖', spec: '瓶装', price: 9, cat: '零食' },
    { id: 'p13', name: '巧克力', spec: '条装', price: 7, cat: '零食' },
    { id: 'p14', name: '泡面', spec: '桶装', price: 6, cat: '速食' },
    { id: 'p15', name: '关东煮', spec: '3串', price: 10, cat: '速食' },
    { id: 'p16', name: '茶叶蛋', spec: '个', price: 2.5, cat: '速食' },
    { id: 'p17', name: '打火机', spec: '个', price: 2, cat: '日用', hot: true },
    { id: 'p18', name: '纸巾', spec: '小包', price: 2, cat: '日用' },
    { id: 'p19', name: '湿巾', spec: '10片', price: 5, cat: '日用' },
    { id: 'p20', name: '充电线', spec: 'Type-C', price: 25, cat: '日用' },
    { id: 'p21', name: '一次性雨衣', spec: '件', price: 12, cat: '日用' }
  ];

  // 顾客端快捷标签:点一下就能贴到商品上
  var QUICK_TAGS = ['冰', '常温', '大份', '小份', '加辣', '不要辣', '要吸管', '要袋子'];

  // 起送 / 配送费规则(后台可改,这个 Demo 先写死成常量,方便你改)
  var RULES = {
    minAmount: 0,      // 起送金额,0 = 不限制
    deliveryFee: 0,    // 楼内配送费,一般 0
    freeAbove: 0       // 满多少免配送费
  };

  /* ============================ 小工具 ============================ */

  var round2 = function (n) { return Math.round((Number(n) || 0) * 100) / 100; };

  var uid = function (prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' +
      Math.random().toString(36).slice(2, 8);
  };

  var nowISO = function () { return new Date().toISOString(); };

  // 当天日期字符串 yyyy-mm-dd
  function dayKey(d) {
    var t = d ? new Date(d) : new Date();
    var m = String(t.getMonth() + 1).padStart(2, '0');
    var day = String(t.getDate()).padStart(2, '0');
    return t.getFullYear() + '-' + m + '-' + day;
  }

  // "3小时前" / "刚刚"
  function timeAgo(iso, now) {
    var t = new Date(iso).getTime();
    var base = now ? new Date(now).getTime() : Date.now();
    var s = Math.max(0, Math.floor((base - t) / 1000));
    if (s < 60) return '刚刚';
    if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
    if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
    return Math.floor(s / 86400) + ' 天前';
  }

  function hhmm(iso) {
    var t = new Date(iso);
    return String(t.getHours()).padStart(2, '0') + ':' +
      String(t.getMinutes()).padStart(2, '0');
  }

  // 订单编号:SD + 月日 + 4位序号
  function orderNo(seq, date) {
    var d = date ? new Date(date) : new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return 'SD' + m + day + String(seq).padStart(4, '0');
  }

  // 铺位号规范化:"a12" -> "A12","5" -> "5号"
  function normalizeBooth(input) {
    var s = String(input == null ? '' : input).trim();
    if (!s) return '';
    s = s.replace(/\s+/g, '').toUpperCase();
    if (/^\d+$/.test(s)) return s + '号';
    return s;
  }

  /* ============================ 价格计算 ============================ */

  /**
   * 计算一条商品行的小计。
   * @param {{price:number, qty:number}} line
   */
  function lineSubtotal(line) {
    return round2((Number(line && line.price) || 0) * (Number(line && line.qty) || 0));
  }

  /**
   * 计算整单金额。金额以「商家填写的实收」为准,
   * 这里算出来的是参考价,商家可以覆盖。
   * @param {Array} lines
   * @param {object} [rules]
   */
  function calcTotal(lines, rules) {
    var r = Object.assign({}, RULES, rules || {});
    var goods = round2((lines || []).reduce(function (sum, l) {
      return sum + lineSubtotal(l);
    }, 0));
    var fee = 0;
    if (goods > 0 && !(r.freeAbove > 0 && goods >= r.freeAbove)) {
      fee = round2(r.deliveryFee);
    }
    return { goods: goods, deliveryFee: fee, total: round2(goods + fee) };
  }

  /**
   * 校验一单能不能提交。
   * @returns {{ok:boolean, errors:string[]}}
   */
  function validateDraft(draft) {
    var errors = [];
    var d = draft || {};
    if (!d.floor) errors.push('请选择楼层');
    if (!normalizeBooth(d.booth)) errors.push('请填写铺位号');
    if (!String(d.contact || '').trim()) errors.push('请填写联系人');
    if (!/^1\d{10}$/.test(String(d.phone || '').replace(/\D/g, ''))) {
      errors.push('手机号要是 11 位,以 1 开头');
    }
    var lines = (d.lines || []).filter(function (l) {
      return l && String(l.name || '').trim();
    });
    if (!lines.length) errors.push('至少要点一样东西');
    var badQty = lines.some(function (l) { return !(Number(l.qty) > 0); });
    if (badQty) errors.push('数量必须大于 0');
    return { ok: errors.length === 0, errors: errors };
  }

  /* ============================ 订单构造 ============================ */

  function makeLine(input) {
    var l = input || {};
    var qty = Number(l.qty);
    if (!isFinite(qty) || qty <= 0) qty = 1;
    return {
      id: l.id || uid('ln'),
      name: String(l.name || '').trim(),
      spec: String(l.spec || '').trim(),
      tags: Array.isArray(l.tags) ? l.tags.slice() : [],
      price: round2(l.price),
      qty: Math.floor(qty),
      note: String(l.note || '').trim()
    };
  }

  /**
   * 建一张新订单(还没进库)。
   */
  function createOrder(draft, opts) {
    var o = opts || {};
    var v = validateDraft(draft);
    if (!v.ok) throw new Error('订单不合法: ' + v.errors.join('; '));

    var lines = draft.lines
      .filter(function (l) { return l && String(l.name || '').trim(); })
      .map(makeLine);

    var money = calcTotal(lines, o.rules);

    return {
      id: uid('od'),
      no: o.no || orderNo(o.seq || 1, o.now),
      status: 'pending',
      payment: 'unpaid',
      payNote: '',
      floor: draft.floor,
      booth: normalizeBooth(draft.booth),
      contact: String(draft.contact).trim(),
      phone: String(draft.phone).replace(/\D/g, ''),
      lines: lines,
      note: String(draft.note || '').trim(),
      expects: draft.expects === 'later' ? 'later' : 'asap',
      expectAt: draft.expectAt || '',
      // 参考价,商家可以改 amount
      quoted: money,
      amount: money.total,
      amountEdited: false,
      createdAt: o.now || nowISO(),
      acceptedAt: '',
      deliveredAt: '',
      canceledAt: '',
      logs: [{ at: o.now || nowISO(), text: '顾客下单' }]
    };
  }

  /* ============================ 状态机 ============================ */

  function canTransit(from, to) {
    if (from === 'canceled') return false;
    if (to === 'canceled') return from === 'pending';
    var i = FLOW.indexOf(from), j = FLOW.indexOf(to);
    // 只能往前走一步,不能跳、不能回头
    return i >= 0 && j === i + 1;
  }

  /**
   * 推进一步。返回新的订单对象(不可变风格,方便以后接云数据库)。
   */
  function transit(order, to, opts) {
    var o = opts || {};
    var at = o.now || nowISO();
    if (!canTransit(order.status, to)) {
      throw new Error('不能从「' + STATUS_TEXT[order.status] + '」直接变成「' +
        (STATUS_TEXT[to] || to) + '」');
    }
    var next = Object.assign({}, order, { logs: order.logs.slice() });
    next.status = to;
    if (to === 'delivering') next.acceptedAt = at;
    if (to === 'delivered') next.deliveredAt = at;
    if (to === 'canceled') next.canceledAt = at;
    next.logs.push({ at: at, text: (o.by || '商家') + '：' + STATUS_TEXT[to] });

    if (o.amount != null) {
      next.amount = round2(o.amount);
      next.amountEdited = true;
      next.logs.push({ at: at, text: '商家改成 ¥' + next.amount.toFixed(2) });
    }
    return next;
  }

  /**
   * 标记收款。
   * @param {object} order
   * @param {'unpaid'|'cash'|'transfer'|'credit'} payment
   */
  function markPayment(order, payment, opts) {
    if (!(payment in PAY_TEXT)) throw new Error('未知的付款方式: ' + payment);
    var o = opts || {};
    var at = o.now || nowISO();
    var next = Object.assign({}, order, { logs: order.logs.slice() });
    next.payment = payment;
    if (o.payNote != null) next.payNote = String(o.payNote);
    next.paidAt = SETTLED[payment] ? at : '';
    next.logs.push({ at: at, text: '商家标记：' + PAY_TEXT[payment] });
    return next;
  }

  /* ============================ 订单仓库 ============================ */

  /**
   * 一个纯内存 + 可选持久化的仓库。
   * @param {{load?:Function, save?:Function}} [io]
   */
  function createStore(io) {
    var driver = io || {};
    var orders = [];
    var seq = 0;

    function persist() {
      if (typeof driver.save === 'function') driver.save(orders, seq);
    }

    var store = {
      /** 从外部加载(浏览器里从 localStorage,云上从数据库) */
      hydrate: function (data) {
        orders = (data && Array.isArray(data.orders)) ? data.orders.map(cloneOrder) : [];
        seq = (data && Number(data.seq)) || orders.length;
        return store;
      },

      dump: function () { return { orders: orders.map(cloneOrder), seq: seq }; },

      all: function () { return orders.slice(); },

      get: function (id) {
        return orders.find(function (o) { return o.id === id; }) || null;
      },

      /** 下单 */
      place: function (draft, opts) {
        seq += 1;
        var order = createOrder(draft, Object.assign({ seq: seq }, opts));
        orders = [order].concat(orders);
        persist();
        return order;
      },

      /** 推进状态 */
      advance: function (id, to, opts) {
        var idx = orders.findIndex(function (o) { return o.id === id; });
        if (idx < 0) throw new Error('订单不存在: ' + id);
        var next = transit(orders[idx], to, opts);
        orders = orders.slice();
        orders[idx] = next;
        persist();
        return next;
      },

      /** 标记收款 */
      settle: function (id, payment, opts) {
        var idx = orders.findIndex(function (o) { return o.id === id; });
        if (idx < 0) throw new Error('订单不存在: ' + id);
        var next = markPayment(orders[idx], payment, opts);
        orders = orders.slice();
        orders[idx] = next;
        persist();
        return next;
      },

      /** 改金额 */
      setAmount: function (id, amount, opts) {
        var idx = orders.findIndex(function (o) { return o.id === id; });
        if (idx < 0) throw new Error('订单不存在: ' + id);
        var order = orders[idx];
        if (order.status === 'canceled') throw new Error('已取消的订单不能改金额');
        var at = (opts && opts.now) || nowISO();
        var next = Object.assign({}, order, { logs: order.logs.slice() });
        next.amount = round2(amount);
        next.amountEdited = true;
        next.logs.push({ at: at, text: '商家改成 ¥' + next.amount.toFixed(2) });
        orders = orders.slice();
        orders[idx] = next;
        persist();
        return next;
      },

      /** 按状态取单,新的在前 */
      byStatus: function (status) {
        return orders.filter(function (o) { return o.status === status; });
      },

      /** 未结清的挂账单(按铺位分组) */
      creditByBooth: function () {
        var map = {};
        orders.forEach(function (o) {
          if (o.status === 'canceled') return;
          if (SETTLED[o.payment]) return;
          var key = o.floor + ' ' + o.booth;
          if (!map[key]) map[key] = { booth: key, contact: o.contact, amount: 0, count: 0 };
          map[key].amount = round2(map[key].amount + o.amount);
          map[key].count += 1;
        });
        return Object.keys(map).map(function (k) { return map[k]; })
          .sort(function (a, b) { return b.amount - a.amount; });
      }
    };

    return store;
  }

  function cloneOrder(o) {
    return Object.assign({}, o, {
      lines: (o.lines || []).map(function (l) { return Object.assign({}, l, { tags: (l.tags || []).slice() }); }),
      logs: (o.logs || []).map(function (l) { return Object.assign({}, l); })
    });
  }

  /* ============================ 统计 ============================ */

  /**
   * 某一天的经营小结。
   * @param {Array} orders
   * @param {string} [day] yyyy-mm-dd,默认今天
   */
  function dailyStats(orders, day) {
    var key = day || dayKey();
    var list = (orders || []).filter(function (o) {
      return o.status !== 'canceled' && dayKey(o.createdAt) === key;
    });
    var sum = function (f) {
      return round2(list.reduce(function (s, o) { return s + (f(o) || 0); }, 0));
    };
    var paid = list.filter(function (o) { return SETTLED[o.payment]; });
    var credit = list.filter(function (o) { return !SETTLED[o.payment]; });

    return {
      day: key,
      orders: list.length,
      delivered: list.filter(function (o) { return o.status === 'delivered'; }).length,
      pending: list.filter(function (o) { return o.status === 'pending'; }).length,
      delivering: list.filter(function (o) { return o.status === 'delivering'; }).length,
      gmv: sum(function (o) { return o.amount; }),
      paidAmount: round2(paid.reduce(function (s, o) { return s + o.amount; }, 0)),
      creditAmount: round2(credit.reduce(function (s, o) { return s + o.amount; }, 0)),
      creditOrders: credit.length,
      avgTicket: list.length ? round2(sum(function (o) { return o.amount; }) / list.length) : 0,
      topItems: topItems(list, 5)
    };
  }

  /** 卖得最多的商品 */
  function topItems(orders, limit) {
    var map = {};
    (orders || []).forEach(function (o) {
      (o.lines || []).forEach(function (l) {
        var key = l.name + (l.spec ? '(' + l.spec + ')' : '');
        if (!map[key]) map[key] = { name: key, qty: 0, amount: 0 };
        map[key].qty += l.qty;
        map[key].amount = round2(map[key].amount + lineSubtotal(l));
      });
    });
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return b.qty - a.qty; })
      .slice(0, limit || 5);
  }

  /* ============================ 顾客端视图 ============================ */

  /**
   * 顾客看到的订单简介,用来渲染「我的订单」。
   */
  function customerView(order, now) {
    var qty = (order.lines || []).reduce(function (s, l) { return s + l.qty; }, 0);
    return {
      id: order.id,
      no: order.no,
      where: order.floor + ' ' + order.booth,
      summary: (order.lines || []).map(function (l) {
        return l.name + '×' + l.qty + (l.tags.length ? '(' + l.tags.join('/') + ')' : '');
      }).join('、'),
      qty: qty,
      amount: order.amount,
      canCancel: order.status === 'pending',
      steps: FLOW.map(function (s) {
        var done = FLOW.indexOf(order.status) >= FLOW.indexOf(s);
        return { key: s, text: STATUS_TEXT[s], done: done };
      }),
      status: order.status,
      statusText: STATUS_TEXT[order.status],
      payment: order.payment,
      paymentText: PAY_TEXT[order.payment],
      settled: SETTLED[order.payment],
      since: timeAgo(order.createdAt, now),
      at: hhmm(order.createdAt)
    };
  }

  /* ============================ 导出 ============================ */

  return {
    // 常量
    FLOORS: FLOORS,
    FLOW: FLOW,
    STATUS_TEXT: STATUS_TEXT,
    PAY_TEXT: PAY_TEXT,
    SETTLED: SETTLED,
    CATALOG: CATALOG,
    QUICK_TAGS: QUICK_TAGS,
    RULES: RULES,
    // 工具
    round2: round2,
    uid: uid,
    nowISO: nowISO,
    dayKey: dayKey,
    timeAgo: timeAgo,
    hhmm: hhmm,
    orderNo: orderNo,
    normalizeBooth: normalizeBooth,
    // 业务
    lineSubtotal: lineSubtotal,
    calcTotal: calcTotal,
    validateDraft: validateDraft,
    makeLine: makeLine,
    createOrder: createOrder,
    canTransit: canTransit,
    transit: transit,
    markPayment: markPayment,
    createStore: createStore,
    dailyStats: dailyStats,
    topItems: topItems,
    customerView: customerView
  };
});
