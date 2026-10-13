/**
 * 用 GitHub API 打开/查询 Pages —— 由 enable-pages.cmd 调用。
 *
 * 为什么用 Node 而不是 PowerShell:
 *   某些 Windows 环境下 schannel / .NET 的 HTTPS 会因为拿不到系统加密凭据
 *   而失败(SEC_E_NO_CREDENTIALS / "基础连接已经关闭")。
 *   Node 自带 OpenSSL,不受这个问题影响,所以这里用 Node 发请求。
 *
 * 用法:node tools/github-pages.mjs <owner> <repo> <branch> <token>
 * 只输出一行结果,方便被 .cmd 解析。Token 不会被打印出来。
 */

const [owner, repo, branch, token] = process.argv.slice(2);

if (!owner || !repo || !branch || !token) {
  console.log('FAIL usage: github-pages.mjs <owner> <repo> <branch> <token>');
  process.exit(2);
}

const API = 'https://api.github.com';
const headers = {
  authorization: 'Bearer ' + token,
  accept: 'application/vnd.github+json',
  'user-agent': 'mall-delivery-pages',
  'content-type': 'application/json'
};

async function api(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch { /* 可能没有 body */ }
  return { status: res.status, data };
}

try {
  // 1. 先确认仓库和 token 都对
  const repoInfo = await api('GET', `/repos/${owner}/${repo}`);
  if (repoInfo.status === 404) {
    console.log('FAIL repo not found (did the push finish?)');
    process.exit(1);
  }
  if (repoInfo.status === 401 || repoInfo.status === 403) {
    console.log('FAIL token rejected (scope? expired?)');
    process.exit(1);
  }
  if (repoInfo.status !== 200) {
    console.log('FAIL repo lookup HTTP ' + repoInfo.status);
    process.exit(1);
  }

  const defaultBranch = repoInfo.data.default_branch;

  // 2. 仓库必须有内容才谈得上开 Pages。
  //    注意:不能用 repoInfo.data.size —— GitHub 对新推送的仓库会延迟上报体积,
  //    明明已经推上去了却可能返回 0,所以这里改成看提交数。
  const commits = await api('GET', `/repos/${owner}/${repo}/commits?per_page=1`);
  if (commits.status !== 200 || !Array.isArray(commits.data) || commits.data.length === 0) {
    console.log('FAIL repo has no commits yet - the push has not succeeded');
    process.exit(1);
  }

  // 3. 已经开过就直接报告
  const existing = await api('GET', `/repos/${owner}/${repo}/pages`);
  if (existing.status === 200 && existing.data && existing.data.html_url) {
    console.log(`OK already-on ${existing.data.html_url} status=${existing.data.status}`);
    process.exit(0);
  }

  // 4. 开 Pages:从分支的根目录发布
  const created = await api('POST', `/repos/${owner}/${repo}/pages`, {
    source: { branch: branch || defaultBranch, path: '/' }
  });

  if (created.status === 201 && created.data && created.data.html_url) {
    console.log(`OK created ${created.data.html_url} status=${created.data.status}`);
    process.exit(0);
  }
  if (created.status === 409) {
    console.log(`OK already-on https://${owner}.github.io/${repo}/`);
    process.exit(0);
  }
  if (created.status === 422) {
    console.log('FAIL 422 ' + (created.data && created.data.message ? created.data.message : 'unprocessable'));
    process.exit(1);
  }

  console.log('FAIL HTTP ' + created.status + ' ' +
    (created.data && created.data.message ? created.data.message : ''));
  process.exit(1);
} catch (e) {
  console.log('FAIL ' + e.message);
  process.exit(1);
}
