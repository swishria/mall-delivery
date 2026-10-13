# 楼里送 · 商场便利店「楼内送货」Demo

一个自己玩的小项目,照着**「爸妈在商场开便利店,靠微信群给其他楼层送货」**这个场景做的。

界面是两个端:**顾客端**(商场里的人下单)和**商家端**(你爸妈接单、送货、标记收钱)。数据存在浏览器本地,不用服务器、不用注册、双击打开就能用。

> 这是一个**练习用的 Demo**,不是能直接上线的产品。它不涉及真实付款,商品名字是示例数据。

---

## 一、怎么跑起来

**双击 `index.html`** 就行了。不用装 Node、不用装微信开发者工具、不用服务器。

推荐玩法(能看到整个流程动起来):

1. 双击 `index.html` 打开,先切到右上角**「商家端」**
2. 往下拉,点 **「造几条假单」** —— 会生成 5 条不同状态的订单(待接单 / 配送中 / 已送达 / 挂账)
3. 切回**「顾客端」**,给"5F A12 美甲店"点几样东西下单
4. 再切回**「商家端」**,你会看到新单进来了(顶栏还会闪一个小红点),点「接单,去送」→「送到了」→ 标记「已付转账」

想更真实一点:**把 `index.html` 用两个浏览器窗口并排打开**,一个切顾客端、一个切商家端。
同一个浏览器共享数据,你在左边下单,右边会自动出现(约 1 秒内),像真的两拨人在用。

---

## 二、目录结构

```
mall-delivery/
  index.html          整个界面(顾客端 + 商家端 + 样式 + 交互,单文件)
  src/core.js         纯逻辑层:价格、校验、状态机、订单仓库、统计
  test/core.test.js   逻辑层测试(103 项)
  test/smoke.js       界面冒烟测试(86 项,用假 DOM 跑真实页面脚本)
  run-tests.cmd       一键跑两套测试(双击即可,推荐)
  run-tests.ps1       同上,PowerShell 版
  serve.cmd           局域网共享,自动列出你的内网 IP
  push-to-github.cmd  一键推送到 GitHub(要一个 token)
  enable-pages.cmd    一键开启 GitHub Pages(推送成功后再跑)
  share-public.cmd    不要账号,开个临时公网隧道
  download.cmd        多级回退下载器,被上面两个脚本调用
  tools/github-pages.mjs  调 GitHub API 开 Pages(用 Node 发请求)
  README.md           你现在看的这个
```

**为什么要把 `core.js` 单独拆出来?**
因为"算钱、校验、状态流转、统计"这些是**业务规则**,和界面无关。拆开的好处:

- 可以不开浏览器就测(这就是 `core.test.js` 干的事)
- 以后想接云开发/后端,只要换掉"存储"那一层,界面不用动
- 规则写在文件开头的常量里,改价格、改规则不用翻界面代码

---

## 三、设计上的几个决定(以及为什么)

这些是我照着这个真实场景特意做的取舍,不是随便写的:

| 决定 | 原因 |
|---|---|
| **不做商品列表页,顾客可以自己打字** | 你爸妈卖的东西杂、还经常变,维护商品库是负担。顾客想买啥就打啥,再点快捷标签补"冰/常温/大瓶" |
| **不做在线支付,只做"标记收款"** | 楼里都是熟人,当面给钱/月底结更自然。商家点一下「已付现金 / 已付转账 / 挂账」就行 |
| **订单状态只能往前走一步** | 防止手滑:待接单不能直接跳"已送达";已经在路上的单不能取消 |
| **没有地图、没有骑手调度、没有抢单** | 楼内配送距离只有几十米,骑手就是爸妈自己。加了纯属浪费 |
| **不做实时位置** | 同上。真要做也是几百米内,没意义 |
| **楼内地址 = 楼层 + 铺位号** | 不是"地址",是"5F A12"。还做了「常去铺位」快捷按钮,老客户一点就填好 |
| **Demo 不碰烟草和槟榔** | 见下面第五节 |
| **挂账单独统计** | "谁还欠着钱"是这种生意最真实的痛点,所以商家端顶部专门有一块 |

---

## 四、代码结构速查

### `src/core.js` 里能用的东西

```js
// 常量(改这里就能改规则)
MallCore.FLOORS        // ['3F','4F','5F','6F']
MallCore.CATALOG       // 预设商品(21 个,可随意改)
MallCore.QUICK_TAGS    // ['冰','常温','大份','小份',...]
MallCore.RULES         // 起送金额 / 配送费 / 满额免配送

// 算钱
MallCore.calcTotal(lines, rules)      // { goods, deliveryFee, total }
MallCore.lineSubtotal(line)

// 校验与建单
MallCore.validateDraft(draft)         // { ok, errors: [] }
MallCore.createOrder(draft, opts)

// 状态机
MallCore.canTransit(from, to)         // true / false
MallCore.transit(order, to, opts)     // 返回新对象,不改旧的

// 仓库(内存 + 可选持久化)
var store = MallCore.createStore({ save: fn });
store.place(draft);                   // 下单
store.advance(id, 'delivering');      // 推进状态
store.settle(id, 'credit');           // 标记收款
store.setAmount(id, 12.5);            // 改金额
store.byStatus('pending');
store.creditByBooth();                // 谁还欠着钱
store.dump(); store.hydrate(data);    // 存 / 读

// 统计
MallCore.dailyStats(orders)           // 今日营业额、已收、未收、客单价…
MallCore.topItems(orders, 5)          // 热销榜
```

### 订单长什么样

```js
{
  id, no: 'SD01050001',
  status: 'pending' | 'delivering' | 'delivered' | 'canceled',
  payment: 'unpaid' | 'cash' | 'transfer' | 'credit',
  floor: '5F', booth: 'A12',
  contact: '美甲店 小周', phone: '13800001111',
  lines: [{ name:'冰红茶', spec:'500ml', price:4, qty:2, tags:['冰'], note:'' }],
  note: '要两根吸管',
  expects: 'asap' | 'later', expectAt: '',
  amount: 12, amountEdited: false,
  createdAt, acceptedAt, deliveredAt, canceledAt, paidAt,
  logs: [{ at, text }]        // 每一步都留痕
}
```

---

## 五、⚠️ 关于烟草和槟榔(重要)

这个 Demo **故意没有放任何烟草类商品**,`core.test.js` 里还有一条测试专门守着这件事。

原因:按规定,**任何公民、法人或其他组织都不得通过信息网络销售烟草专卖品**,而"信息网络"明确包含微信等平台;违规可以被责令停业整顿,**直至取消烟草专卖零售资格**。槟榔制品同样被禁止网络销售。

所以:

- **想做真的**:小程序/网页里只放饮料零食日用品这些,烟草那部分留在**线下当面交易**
- **这个 Demo**:商品名是示例数据,你随便改成可乐薯片都行,**别把它当成一个卖烟的工具去上线**
- 有疑问就去问当地**烟草专卖局**,以他们的答复为准,别听我或网上的说法

---

## 六、跑测试

**最省事:双击 `run-tests.cmd`**(纯英文脚本,不受执行策略影响,双击就行)

或者手动跑:

```powershell
node test/core.test.js     # 逻辑层:103 项
node test/smoke.js         # 界面:86 项
```

也提供了 PowerShell 版 `run-tests.ps1`,但如果双击报
"在此系统上禁止运行脚本",那是 Windows 的执行策略限制,用下面任一种:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\run-tests.ps1
# 或者干脆用上面那个 .cmd
```

`test/smoke.js` 的做法有点意思:它**不靠浏览器**,而是把 `index.html` 里那段真实的应用脚本抠出来,塞进一个假 DOM 里跑,然后模拟点击(加购物车 → 下单 → 接单 → 送达 → 标记收款)。这样不开浏览器也能把界面流程验证一遍。

设 `SMOKE_DEBUG=1` 会打印渲染过程的调试信息:

```powershell
$env:SMOKE_DEBUG='1'; node test/smoke.js
```

---

## 七、怎么让别人也能打开

⚠️ **先搞清楚一件事**:这个 Demo 的数据存在**每个人自己的浏览器**里(`localStorage`)。
所以你把网址发出去,别人打开看到的是**他自己的空白副本** —— 他在手机上下的单,你的页面上看不到。

**发出去能让人玩、能演示,但它不是"多人共用一个系统"。** 想那样必须加后端(见第八节第 5 条)。

| 方式 | 怎么做 | 适合 |
|---|---|---|
| **发文件夹** | 把整个 `mall-delivery` 打包成 zip 发出去,对方解压后双击 `index.html` | 给用电脑的人看。注意别只发 `index.html`,它要引用 `src/core.js` |
| **局域网** | 在项目目录跑 `serve.cmd`,然后让同一 WiFi 下的人打开 `http://<你的内网IP>:8000/mall-delivery/index.html` | 现场几个人一起看 |
| **公网托管** | 推到 GitHub → 开 Pages,得到 `https://用户名.github.io/mall-delivery/` | 想发个链接随时能打开 |

### 推到 GitHub(项目里已经准备好了)

双击 **`push-to-github.cmd`**,它会:

1. 检查环境和当前提交
2. 让你粘贴一个 **GitHub Personal Access Token**(隐藏输入,只在这一个窗口里用)
3. 确认身份后,**自动创建仓库** `swishria/mall-delivery`(如果不存在)
4. 把代码推上去
5. 提示你开启 Pages

推送成功后,再双击 **`enable-pages.cmd`**(填同一个 token)就能把网页发布出来:

```
https://swishria.github.io/mall-delivery/
```

头一次要等 1–3 分钟才会生效。

**关于那个 token**:这台机器上没有 GitHub 凭据、也没有 SSH 私钥,所以 git 没法认证,token 是最快的路。
去 <https://github.com/settings/tokens/new?scopes=repo&description=mall-delivery> 建一个,勾上 `repo` 就行。
脚本**不会**把 token 写进 `.git/config`(推送时用一次即丢),**用完请去 <https://github.com/settings/tokens> 删掉它**。

**如果推的时候报 `schannel` 或 SSL 错误**,先执行一次:

```powershell
git config --global http.sslBackend openssl
```

然后重新双击那个脚本。

### 不开 GitHub 也能分享

项目根目录还有个 `mall-delivery.bundle`(在上一级 `D:\test\` 里),它是完整的 git 仓库快照。
对方拿到这个文件,一条命令就能得到一个一模一样的仓库:

```powershell
git clone mall-delivery.bundle mall-delivery
```

### 想让别人在微信里打开?

微信会拦截**未备案域名**的外链,所以在微信内置浏览器里体验受限。
如果你的目的是"发给微信好友看",最稳的是**直接发 zip**(方式 1)。

---

## 八、数据存在哪 / 怎么清空

- 存在浏览器 `localStorage`,键名 `mallDelivery.v1`(偏好设置是 `mallDelivery.pref.v1`)
- 刷新页面数据还在;清浏览器缓存会没
- 清空:商家端拉到底 →「清空全部」

---

## 九、可以接着玩的方向

按难度排序,都是这个 Demo 自然的延伸:

1. **改数据**:改 `core.js` 里的 `CATALOG` 和 `FLOORS`,换成真实的商场楼层和你家店的东西
2. **改规则**:`RULES` 里加起送金额、楼内配送费、满额减免(算钱函数已经支持了)
3. **加打印**:接单后生成一张小票样式的文本卡片,方便截图/复制
4. **加月结**:用 `creditByBooth()` 按月汇总,导出一张"这个月谁欠多少"的账单
5. **换成真后端**:把 `createStore({ save, hydrate })` 的两个钩子接到云开发数据库 / Supabase,界面不用动 —— **这一步做完,它才真正变成"多人共用一个系统"**
6. **重做成微信小程序**:逻辑层 `core.js` 可以整段搬过去,只把界面换成 wxml/wxss
7. **重写成 React/Vue**:同一套数据模型换个框架实现一遍 —— 这是最划算的学习法

---

## 十、已知的取舍(不是 bug)

- 没有登录和权限:顾客端和商家端靠手动切换。真上线必须拆开
- 没有并发处理:两个窗口同时改同一条订单会互相覆盖(本地存储的固有限制)
- 顾客端"我的订单"显示的是**这台设备上所有订单**,没有区分人。真上线要按用户过滤
- 金额默认取"参考价",顾客写的自定义商品是 0 元,要靠商家在接单时填真实价格
