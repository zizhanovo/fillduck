/* 填鸭 FillDuck 侧边栏
 * 全局 fillduck 由 vendor/fillduck.js 提供（引擎，只读引用）。
 * 资料卡存 chrome.storage.local；附件只放内存，绝不写入存储。
 */
'use strict';

const STD_FIELDS = [
  { key: 'name', label: '姓名' },
  { key: 'mobile', label: '手机' },
  { key: 'email', label: '邮箱' },
  { key: 'address', label: '详细地址' },
  { key: 'province', label: '省' },
  { key: 'city', label: '市' },
  { key: 'district', label: '区' },
  { key: 'postcode', label: '邮编' },
  { key: 'company', label: '公司名称' },
  { key: 'creditCode', label: '统一社会信用代码' },
  { key: 'title', label: '职位' },
  { key: 'website', label: '网址' },
];
const PROFILE_TYPES = ['个人', '公司', '案件', '自定义'];
// 浏览器禁止插件改动的网页（应用商店等），直接判定填不了
const BLOCKED_HOSTS = ['chromewebstore.google.com', 'microsoftedge.microsoft.com'];
const SAVE_DELAY = 400;

const $ = (id) => document.getElementById(id);

const state = {
  profiles: [],
  selectedId: null,
  lastSavedJson: '',
};

// ───────────────────────── 存储 ─────────────────────────

let saveTimer = null;

function scheduleSave() {
  clearTimeout(saveTimer);
  $('save-status').textContent = '正在保存…';
  saveTimer = setTimeout(saveNow, SAVE_DELAY);
}

async function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  const json = JSON.stringify(state.profiles);
  try {
    state.lastSavedJson = json;
    await chrome.storage.local.set({ profiles: state.profiles, selectedId: state.selectedId });
    $('save-status').textContent = '已保存';
  } catch (e) {
    state.lastSavedJson = '';
    $('save-status').textContent = `保存失败：${e.message}`;
  }
}

async function loadAll() {
  const got = await chrome.storage.local.get(['profiles', 'selectedId']);
  state.profiles = Array.isArray(got.profiles) ? got.profiles : [];
  state.lastSavedJson = JSON.stringify(state.profiles);
  state.selectedId = state.profiles.some((p) => p.id === got.selectedId) ? got.selectedId : state.profiles[0]?.id || null;
}

// 另一个窗口的侧边栏改了数据时同步过来（自己这边有未保存的改动时不覆盖）
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.profiles || saveTimer) return;
  const incoming = changes.profiles.newValue || [];
  if (JSON.stringify(incoming) === state.lastSavedJson) return;
  state.profiles = incoming;
  state.lastSavedJson = JSON.stringify(incoming);
  if (!state.profiles.some((p) => p.id === state.selectedId)) state.selectedId = state.profiles[0]?.id || null;
  renderList();
  renderEditor();
});

// 关闭侧边栏前把没来得及保存的改动写掉
window.addEventListener('pagehide', () => {
  if (saveTimer) saveNow();
});

// ───────────────────────── 资料卡 ─────────────────────────

const newId = () => crypto.randomUUID();
const newCustomKey = () => `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function current() {
  return state.profiles.find((p) => p.id === state.selectedId) || null;
}

// 只保留引擎认识的结构，去掉插件自己加的 id
function toPlainCard(p) {
  return { name: p.name, type: p.type, fields: { ...(p.fields || {}) }, custom: (p.custom || []).map((c) => ({ key: c.key, label: c.label, value: c.value })) };
}

function renderList() {
  const ul = $('card-list');
  ul.textContent = '';
  for (const p of state.profiles) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.id = p.id;
    btn.setAttribute('aria-current', String(p.id === state.selectedId));
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = p.name || '（未命名）';
    const type = document.createElement('span');
    type.className = 'type';
    type.textContent = p.type;
    btn.append(name, type);
    btn.addEventListener('click', () => select(p.id));
    li.append(btn);
    ul.append(li);
  }
  const empty = !state.profiles.length;
  $('card-empty').hidden = !empty;
  $('btn-copy').disabled = empty;
  $('btn-delete').disabled = empty;
  $('btn-export').disabled = empty;
}

function select(id) {
  if (saveTimer) saveNow();
  state.selectedId = id;
  chrome.storage.local.set({ selectedId: id }).catch(() => {});
  renderList();
  renderEditor();
}

function makeInput(id, labelText, value, onInput, multiline) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = labelText;
  const input = document.createElement(multiline ? 'textarea' : 'input');
  if (multiline) input.rows = 3;
  else input.type = 'text';
  input.id = id;
  input.autocomplete = 'off';
  input.value = value || '';
  input.addEventListener('input', () => onInput(input.value));
  wrap.append(label, input);
  return wrap;
}

function renderEditor() {
  const p = current();
  $('editor').hidden = !p;
  if (!p) return;
  $('p-name').value = p.name || '';
  $('p-type').value = PROFILE_TYPES.includes(p.type) ? p.type : '个人';

  const std = $('std-fields');
  std.textContent = '';
  for (const f of STD_FIELDS) {
    std.append(
      makeInput(`std-${f.key}`, f.label, p.fields?.[f.key], (v) => {
        p.fields = p.fields || {};
        if (v === '') delete p.fields[f.key];
        else p.fields[f.key] = v;
        changed();
      }),
    );
  }
  renderCustom();
  showProfileErrors();
}

function renderCustom() {
  const p = current();
  const box = $('custom-fields');
  box.textContent = '';
  p.custom = Array.isArray(p.custom) ? p.custom : [];
  p.custom.forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'custom-row';
    row.append(
      makeInput(`cl-${c.key}`, `显示名 ${i + 1}`, c.label, (v) => {
        c.label = v;
        changed();
      }),
      makeInput(`cv-${c.key}`, `内容 ${i + 1}`, c.value, (v) => {
        c.value = v;
        changed();
      }, true),
    );
    const bar = document.createElement('div');
    bar.className = 'row';
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'danger';
    del.textContent = '删掉这一项';
    del.setAttribute('aria-label', `删掉自定义字段「${c.label || i + 1}」`);
    del.addEventListener('click', () => {
      p.custom.splice(i, 1);
      renderCustom();
      changed();
      $('btn-add-custom').focus();
    });
    bar.append(del);
    row.append(bar);
    box.append(row);
  });
}

let validateSeq = 0;
async function showProfileErrors() {
  const p = current();
  const box = $('profile-errors');
  if (!p) return (box.hidden = true);
  const seq = ++validateSeq;
  let errors;
  try {
    const res = await fillduck({ mode: 'validate', profile: toPlainCard(p) });
    errors = res.profileErrors || [];
  } catch (e) {
    errors = [`校验出错：${e.message}`];
  }
  if (seq !== validateSeq) return;
  renderMessages(box, errors.length ? '这张资料卡有问题：' : '', errors);
}

let validateTimer = null;
function changed() {
  scheduleSave();
  clearTimeout(validateTimer);
  validateTimer = setTimeout(showProfileErrors, 250);
}

function renderMessages(box, title, items, kind = 'error') {
  box.textContent = '';
  box.className = `msg ${kind}`;
  box.hidden = !items.length && !title;
  if (box.hidden) return;
  if (title) box.append(document.createTextNode(title));
  if (items.length) {
    const ul = document.createElement('ul');
    for (const t of items) {
      const li = document.createElement('li');
      li.textContent = t;
      ul.append(li);
    }
    box.append(ul);
  }
}

$('p-name').addEventListener('input', (e) => {
  current().name = e.target.value;
  renderList();
  changed();
});
$('p-type').addEventListener('change', (e) => {
  current().type = e.target.value;
  renderList();
  changed();
});
$('btn-add-custom').addEventListener('click', () => {
  const p = current();
  const c = { key: newCustomKey(), label: '', value: '' };
  p.custom.push(c);
  renderCustom();
  changed();
  $(`cl-${c.key}`).focus();
});

$('btn-new').addEventListener('click', async () => {
  const p = { id: newId(), name: '新资料卡', type: '个人', fields: {}, custom: [] };
  state.profiles.push(p);
  select(p.id);
  await saveNow();
  $('p-name').focus();
  $('p-name').select();
});

$('btn-copy').addEventListener('click', async () => {
  const src = current();
  if (!src) return;
  const p = { id: newId(), ...toPlainCard(src), name: `${src.name || '资料卡'} 副本` };
  state.profiles.splice(state.profiles.indexOf(src) + 1, 0, p);
  select(p.id);
  await saveNow();
});

$('btn-delete').addEventListener('click', async () => {
  const p = current();
  if (!p) return;
  if (!confirm(`确定删除资料卡「${p.name || '未命名'}」吗？删除后无法恢复。`)) return;
  const i = state.profiles.indexOf(p);
  state.profiles.splice(i, 1);
  state.selectedId = state.profiles[Math.min(i, state.profiles.length - 1)]?.id || null;
  renderList();
  renderEditor();
  await saveNow();
});

// ───────────────────────── 导入导出 ─────────────────────────

$('btn-export').addEventListener('click', () => {
  const data = { app: 'fillduck', version: 1, profiles: state.profiles.map(toPlainCard) };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  a.href = url;
  a.download = `填鸭资料卡-${stamp}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
});

$('btn-import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  await importText(await file.text(), file.name);
});

$('btn-paste').addEventListener('click', () => {
  const box = $('paste-box');
  box.hidden = !box.hidden;
  $('btn-paste').setAttribute('aria-expanded', String(!box.hidden));
  if (!box.hidden) $('paste-text').focus();
});
$('btn-paste-ok').addEventListener('click', async () => {
  const text = $('paste-text').value.trim();
  if (!text) return renderMessages($('import-msg'), '先把 JSON 粘贴到框里。', []);
  if (await importText(text, '粘贴的内容')) {
    $('paste-text').value = '';
    $('paste-box').hidden = true;
    $('btn-paste').setAttribute('aria-expanded', 'false');
  }
});

// 文件导入与粘贴导入共用；成功返回 true
async function importText(text, source) {
  const box = $('import-msg');
  const res = await parseImport(text);
  if (res.errors.length) {
    renderMessages(box, `导入失败，原有资料卡没有任何改动（${source}）：`, res.errors);
    return false;
  }
  const added = res.cards.map((c) => ({ id: newId(), ...c }));
  state.profiles.push(...added);
  state.selectedId = added[0].id;
  renderList();
  renderEditor();
  await saveNow();
  renderMessages(box, `已导入 ${added.length} 张资料卡。`, [], 'ok');
  return true;
}

// 接受：单张卡、卡数组、{ profiles: [...] }。任何一张不合法就整体拒绝
async function parseImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { errors: [`文件不是有效的 JSON：${e.message}`], cards: [] };
  }
  let list;
  if (Array.isArray(data)) list = data;
  else if (data && typeof data === 'object' && Array.isArray(data.profiles)) list = data.profiles;
  else if (data && typeof data === 'object' && ('name' in data || 'type' in data || 'fields' in data)) list = [data];
  else return { errors: ['文件里没有找到资料卡（应为单张卡、卡数组，或含 profiles 数组的对象）'], cards: [] };
  if (!list.length) return { errors: ['文件里的资料卡列表是空的'], cards: [] };

  const errors = [];
  const cards = [];
  for (let i = 0; i < list.length; i++) {
    const raw = list[i];
    const who = list.length > 1 ? `第 ${i + 1} 张${raw && typeof raw.name === 'string' && raw.name ? `「${raw.name}」` : ''}：` : '';
    const res = await fillduck({ mode: 'validate', profile: raw });
    if (res.profileErrors.length) {
      errors.push(...res.profileErrors.map((m) => who + m));
      continue;
    }
    const card = { name: raw.name, type: raw.type, fields: { ...(raw.fields || {}) }, custom: (raw.custom || []).map((c) => ({ key: c.key, label: c.label, value: c.value })) };
    const keys = card.custom.map((c) => c.key);
    if (new Set(keys).size !== keys.length) errors.push(`${who}自定义字段的键有重复`);
    cards.push(card);
  }
  return { errors, cards: errors.length ? [] : cards };
}

// ───────────────────────── 附件 ─────────────────────────

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

async function readFiles() {
  const out = [];
  for (const f of $('files').files) out.push({ name: f.name, type: f.type, size: f.size, base64: toBase64(await f.arrayBuffer()) });
  return out;
}

// ───────────────────────── 当前标签页 ─────────────────────────

// 缓存活动标签页和权限状态，好让「一口填完」在点击的同步阶段就能发起授权请求
let tabCache = null; // { id, url, hasPerm, allUrls }

async function refreshTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return (tabCache = null);
    const allUrls = await chrome.permissions.contains({ origins: ['<all_urls>'] });
    const o = originOf(tab.url);
    // 一律问浏览器：Chrome 会把 manifest 里声明的 host_permissions 算作已授予，
    // 而 Firefox MV3 把它们当可选权限，安装时并不给，所以不能按清单自己推断。
    const hasPerm = o ? await chrome.permissions.contains({ origins: [`${o}/*`] }) : false;
    tabCache = { id: tab.id, url: tab.url, hasPerm, allUrls };
  } catch (e) {
    tabCache = null;
  }
  return tabCache;
}

function originOf(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : null;
  } catch (e) {
    return null;
  }
}

// 返回不能填的原因；能填返回空串
function blockedReason(url) {
  if (!url) return '';
  let u;
  try {
    u = new URL(url);
  } catch (e) {
    return '网址无法识别';
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return '这是浏览器内部页面或本地文件，插件不能改动';
  if (BLOCKED_HOSTS.includes(u.hostname) || (u.hostname === 'chrome.google.com' && u.pathname.startsWith('/webstore')))
    return '浏览器不允许插件改动应用商店页面';
  return '';
}

chrome.tabs.onActivated.addListener(refreshTab);
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (tab.active && (info.url || info.status)) refreshTab();
});
chrome.windows.onFocusChanged.addListener(refreshTab);
chrome.permissions.onAdded.addListener(refreshTab);
chrome.permissions.onRemoved.addListener(refreshTab);

// ───────────────────────── 一口填完 ─────────────────────────

let recipesPromise = null;
function loadRecipes() {
  // 随插件打包的本地文件，不是网络请求
  recipesPromise =
    recipesPromise ||
    fetch(chrome.runtime.getURL('vendor/recipes.json'))
      .then((r) => r.json())
      .catch((e) => {
        recipesPromise = null;
        throw e;
      });
  return recipesPromise;
}

let filling = false;

// 注意：本函数在 permissions.request 之前不能有任何 await，否则会丢失用户点击手势
function onFill() {
  if (filling) return;
  const profile = current();
  if (!profile) return showNotice('先选一张资料卡（没有的话点「新建」）。');
  const tab = tabCache;
  let permRequest = null;
  if (tab) {
    const reason = blockedReason(tab.url);
    if (reason) return showCannot(reason);
    if (!tab.url) {
      // 看不到网址 = 插件对这个页面没有任何权限。
      // 已经有「所有网站」权限还看不到，说明是浏览器内部页面。
      if (tab.allUrls) return showCannot('这是浏览器内部页面，插件不能改动');
      permRequest = 'probe';
    } else if (!tab.hasPerm) {
      permRequest = chrome.permissions.request({ origins: [`${originOf(tab.url)}/*`] });
    }
  }
  filling = true;
  $('btn-fill').disabled = true;
  showNotice('正在填写…');
  runFill(profile, tab, permRequest).finally(() => {
    filling = false;
    $('btn-fill').disabled = false;
  });
}

async function runFill(profile, cachedTab, permRequest) {
  let probeOk = false;
  try {
    if (permRequest === 'probe') {
      // 没有 tabs 权限时看不到网址，分不清是内部页面还是普通网站。
      // 先空跑一次注入：内部页面会被浏览器直接拒绝（函数体为空，也不会在页面里执行任何东西）；
      // 普通网站报「没有权限」，再申请权限。这一步很快，仍在点击的用户激活有效期内。
      try {
        await chrome.scripting.executeScript({ target: { tabId: cachedTab.id }, func: () => {} });
        probeOk = true; // 已经能注入（例如 activeTab），无需再申请
        permRequest = null;
      } catch (e) {
        if (!/must request permission/i.test(e.message)) return showCannot(explainInjectError(e.message));
        // ponytail: 看不到网址时只能申请「所有网站」；升级路径是让用户先点工具栏图标（activeTab 可见网址）再按同源申请
        permRequest = chrome.permissions.request({ origins: ['<all_urls>'] });
      }
    }
    if (permRequest) {
      let granted = false;
      try {
        granted = await permRequest;
      } catch (e) {
        return showCannot(`授权请求失败：${e.message}`);
      }
      if (!granted) return showNotice('你没有允许填鸭在这个网站填写，所以什么都没做。需要时再点一次「一口填完」即可。');
    }
    // 重新确认活动标签页（授权弹窗期间可能切过页面）
    const tab = await refreshTab();
    if (!tab) return showCannot('找不到当前标签页');
    if (cachedTab && (tab.id !== cachedTab.id || (cachedTab.url && originOf(tab.url) !== originOf(cachedTab.url))))
      return showNotice('当前页面变了，请再点一次「一口填完」。');
    const reason = blockedReason(tab.url);
    if (reason) return showCannot(reason);
    if (!tab.url) return showCannot('这是浏览器内部页面，插件不能改动');
    if (!tab.hasPerm && !probeOk) {
      // 没有缓存（刚打开侧边栏就点）时走到这里：此时已不在点击手势内，只能请用户再点一次
      if (!cachedTab) return showNotice('请再点一次「一口填完」，并在弹窗里允许填鸭在这个网站填写。');
      return showNotice('你没有允许填鸭在这个网站填写，所以什么都没做。');
    }
    await fillTab(tab.id, profile);
  } catch (e) {
    showCannot(e.message);
  }
}

async function fillTab(tabId, profile) {
  let recipes;
  try {
    recipes = await loadRecipes();
  } catch (e) {
    return showCannot(`读取内置配方失败：${e.message}`);
  }
  let files;
  try {
    files = await readFiles();
  } catch (e) {
    return showCannot(`读取附件失败：${e.message}`);
  }
  const input = { mode: 'run', profile: toPlainCard(profile), recipes, files, forceGeneric: $('force-generic').checked };
  let injected;
  try {
    injected = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: fillduck, args: [input] });
  } catch (e) {
    return showCannot(explainInjectError(e.message));
  }
  const res = injected && injected[0] && injected[0].result;
  if (!res || typeof res !== 'object') return showCannot('页面没有返回结果（可能正在跳转，稍后再试）');
  renderResult(res);
  return res;
}

// ───────────────────────── 结果区 ─────────────────────────

// 把浏览器的英文报错翻成人话，原文附在括号里方便排查
function explainInjectError(msg) {
  const known = [
    [/Cannot access a .*URL/i, '这是浏览器内部页面，插件不能改动'],
    [/cannot be scripted/i, '浏览器不允许插件改动应用商店页面'],
    [/must request permission/i, '没有这个网站的填写权限'],
    [/No tab with id|Frame with ID|was removed/i, '标签页已经关闭或正在跳转'],
  ];
  const hit = known.find(([re]) => re.test(msg));
  return hit ? `${hit[1]}（${msg}）` : msg;
}

function showNotice(text) {
  const body = $('result-body');
  body.textContent = '';
  const p = document.createElement('p');
  p.className = 'msg';
  p.textContent = text;
  body.append(p);
}

function showCannot(reason) {
  const body = $('result-body');
  body.textContent = '';
  const p = document.createElement('p');
  p.className = 'msg error';
  p.textContent = reason ? `这个页面填不了：${reason}` : '这个页面填不了';
  body.append(p);
}

const STATUS_TEXT = { ok: '成功', fail: '失败', skip: '跳过' };

function renderResult(res) {
  const body = $('result-body');
  body.textContent = '';
  const add = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    body.append(el);
    return el;
  };

  add('h3', '', `配方：${res.recipe || '未知'}${res.step ? ` · 步骤：${res.step}` : ''}`);
  const s = res.summary || { ok: 0, fail: 0, skip: 0 };
  const sum = add('p', 'summary');
  for (const [k, t] of [['fail', '失败'], ['skip', '跳过'], ['ok', '成功']]) {
    const span = document.createElement('span');
    span.className = k;
    span.textContent = `${t} ${s[k] || 0}`;
    sum.append(span);
  }
  if (res.hint) add('p', 'hint', res.hint);
  if (Array.isArray(res.errors) && res.errors.length) renderMessages(add('div'), '没有执行，原因：', res.errors);

  const list = res.results || [];
  if (!list.length) {
    add('p', 'muted', '没有找到能填的框。');
    return;
  }
  const ul = add('ul', 'results');
  for (const r of list) {
    const li = document.createElement('li');
    li.className = r.status;
    const head = document.createElement('div');
    head.className = 'head';
    const label = document.createElement('span');
    label.textContent = r.label || r.selector || '（未命名字段）';
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = STATUS_TEXT[r.status] || r.status;
    head.append(label, badge);
    li.append(head);

    const dl = document.createElement('dl');
    const row = (k, v) => {
      if (v == null || v === '' || (Array.isArray(v) && !v.length)) return;
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = Array.isArray(v) ? v.join('、') : String(v);
      dl.append(dt, dd);
    };
    row('原因', r.reason);
    row('填入', r.value);
    row('实际', r.actual);
    row('可选项', r.candidates);
    row('备注', r.note);
    row('依据', r.by);
    if (dl.childElementCount) li.append(dl);
    ul.append(li);
  }
}

$('btn-fill').addEventListener('click', onFill);

// ───────────────────────── 启动 ─────────────────────────

(async function init() {
  try {
    await loadAll();
  } catch (e) {
    $('save-status').textContent = `读取资料卡失败：${e.message}`;
  }
  renderList();
  renderEditor();
  refreshTab();
  loadRecipes().catch(() => {});
})();
