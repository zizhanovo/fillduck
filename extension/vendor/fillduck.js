/*
 * 填鸭 FillDuck 填写引擎  MIT License
 *
 * 整个引擎是一个自包含的 async 函数，不引用任何外部变量：
 * - 插件用 chrome.scripting.executeScript({ world: 'MAIN', func: fillduck, args: [input] }) 注入；
 * - agent 把本文件源码粘进页面后调用 fillduck(input)；
 * - Node 自检与示范页只用 mode: 'validate'，不碰 DOM。
 *
 * input = { mode: 'run' | 'validate' | 'scan', profile, recipes, files, forceGeneric }
 */
async function fillduck(input) {
  const VERSION = '0.1.0';
  input = input || {};
  const mode = input.mode || 'run';
  const profile = input.profile || null;
  const recipes = Array.isArray(input.recipes) ? input.recipes : [];
  const files = Array.isArray(input.files) ? input.files : [];

  // ───────────────────────── 资料卡 ─────────────────────────

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
  // 敏感类字段一律不收
  const FORBIDDEN_FIELD = /密码|口令|password|passwd|银行卡|信用卡号|bank.?card|credit.?card|card.?number|cvv/i;

  function str(v) {
    return v == null ? '' : String(v);
  }

  // 按「键 → 显示名」查资料卡字段；支持「案件.举报内容」这种带类型前缀的写法
  function lookup(name) {
    if (!profile) return undefined;
    const fields = profile.fields || {};
    const custom = Array.isArray(profile.custom) ? profile.custom : [];
    const tryOne = (n) => {
      if (Object.prototype.hasOwnProperty.call(fields, n)) return str(fields[n]);
      const std = STD_FIELDS.find((f) => f.label === n);
      if (std && Object.prototype.hasOwnProperty.call(fields, std.key)) return str(fields[std.key]);
      const byKey = custom.find((c) => c && c.key === n);
      if (byKey) return str(byKey.value);
      const byLabel = custom.find((c) => c && c.label === n);
      if (byLabel) return str(byLabel.value);
      return undefined;
    };
    const direct = tryOne(name);
    if (direct !== undefined) return direct;
    const dot = name.indexOf('.');
    return dot > 0 ? tryOne(name.slice(dot + 1)) : undefined;
  }

  const TEMPLATE_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

  // 返回 { value, missing: [字段名] }
  function render(tpl) {
    const missing = [];
    const value = str(tpl).replace(TEMPLATE_RE, (_, name) => {
      const v = lookup(name);
      if (v === undefined || v.trim() === '') missing.push(name);
      return v === undefined ? '' : v;
    });
    return { value, missing };
  }

  const WHEN_RE = /^\s*\{\{\s*([^{}]+?)\s*\}\}\s*(?:(==|!=)\s*(.*?))?\s*$/;
  // ponytail: 天花板是不支持与或逻辑；升级路径是引入小型表达式解析器，禁止使用 eval
  function evalWhen(when) {
    const m = WHEN_RE.exec(when);
    if (!m) return false;
    const v = str(lookup(m[1])).trim();
    if (!m[2]) return v !== '';
    return m[2] === '==' ? v === m[3] : v !== m[3];
  }

  function validateProfile(p) {
    const errors = [];
    if (!p || typeof p !== 'object' || Array.isArray(p)) return ['资料卡必须是对象'];
    if (typeof p.name !== 'string' || !p.name.trim()) errors.push('资料卡缺少名称');
    if (!PROFILE_TYPES.includes(p.type)) errors.push(`资料卡类型必须是 ${PROFILE_TYPES.join(' / ')}`);
    if (p.fields != null) {
      if (typeof p.fields !== 'object' || Array.isArray(p.fields)) errors.push('fields 必须是对象');
      else
        for (const k of Object.keys(p.fields)) {
          if (!STD_FIELDS.some((f) => f.key === k)) errors.push(`未知的标准字段「${k}」`);
          else if (typeof p.fields[k] !== 'string') errors.push(`标准字段「${k}」的值必须是文字`);
        }
    }
    if (p.custom != null) {
      if (!Array.isArray(p.custom)) errors.push('custom 必须是数组');
      else
        p.custom.forEach((c, i) => {
          if (!c || typeof c.key !== 'string' || !c.key.trim()) errors.push(`第 ${i + 1} 个自定义字段缺少键`);
          else if (typeof c.label !== 'string' || !c.label.trim()) errors.push(`自定义字段「${c.key}」缺少显示名`);
          else if (typeof c.value !== 'string') errors.push(`自定义字段「${c.label}」的值必须是文字`);
          else if (FORBIDDEN_FIELD.test(c.key) || FORBIDDEN_FIELD.test(c.label))
            errors.push(`不支持保存密码、银行卡类字段「${c.label}」`);
        });
    }
    return errors;
  }

  // ───────────────────────── 站点内置能力 ─────────────────────────

  const hanOnly = (s) => /^\p{Script=Han}+$/u.test(s);
  const chars = (s) => Array.from(s).length;

  const VALIDATORS = {
    '12315.reporter': () => {
      const errors = [];
      const addr = str(lookup('详细地址')).trim();
      if (chars(addr) > 40) errors.push(`详细地址 ${chars(addr)} 字，超过 40 字上限，请先压缩`);
      return errors;
    },
    '12315.caseCard': () => {
      const errors = [];
      const get = (n) => str(lookup(n)).trim();
      const content = get('举报内容');
      if (!content) errors.push('缺少资料：举报内容');
      else if (chars(content) > 400) errors.push(`举报内容 ${chars(content)} 字，超过 400 字上限`);
      for (const n of ['其他类别描述', '其他问题类别']) {
        const v = get(n);
        if (!v) continue;
        if (!hanOnly(v)) errors.push(`${n}只能填汉字`);
        else if (/其他|其它/.test(v)) errors.push(`${n}不能包含「其他」「其它」`);
      }
      if (get('销售方式') === '网购') {
        const pf = get('电商平台');
        if (!pf) errors.push('销售方式为网购时，电商平台必填');
        else if (chars(pf) > 20) errors.push(`电商平台名称 ${chars(pf)} 字，超过 20 字上限`);
      }
      const unit = get('处理单位');
      const segs = unit.split('/').map((s) => s.trim());
      if (!unit) errors.push('缺少资料：处理单位');
      else if (segs.length !== 3 || segs.some((s) => !s)) errors.push('处理单位必须是「省/市/处理单位」三段，用 / 分隔');
      if (files.length > 4) errors.push(`附件 ${files.length} 个，最多 4 个`);
      for (const f of files) {
        const name = str(f && f.name);
        if (!/\.(jpe?g|png|pdf|mp3|mp4)$/i.test(name)) errors.push(`附件「${name}」格式不支持，只能是 jpg/jpeg/png/pdf/mp3/mp4`);
        // 没传 size 时按 base64 长度估算，避免绕过大小限制
        const size = f && f.size != null ? Number(f.size) : Math.floor((str(f && f.base64).length * 3) / 4);
        if (size > 5 * 1024 * 1024) errors.push(`附件「${name}」超过 5MB`);
      }
      return errors;
    },
  };

  const HINTS = {
    '12315':
      '请人工核对后提交：只点一次「提交」；不要点「上一步」；若提交返回「服务器出错了」，需要从须知页重新开始。',
  };

  // 内置具名动作：站点专用逻辑只能放在这里，配方里不允许写代码
  const BUILTINS = {
    // 举报对象页：有信用代码按代码搜，否则按企业名称搜；恰好一条命中才选择并确认
    '12315.pickCompany': async (ctx) => {
      const code = str(lookup('统一社会信用代码')).trim();
      const name = str(lookup('公司名称')).trim();
      if (!code && !name) return ctx.fail('缺少资料：公司名称或统一社会信用代码');
      const box = await waitUntil(() => document.getElementById('searchBox'), 5000);
      if (!box || typeof window.search !== 'function') return ctx.fail('页面上没有 #searchBox 或 search()');
      setNativeValue(box, code || name);
      fire(box, ['input', 'change']);
      window.search();
      const links = await waitUntil(() => {
        const ls = safeQueryAll('a[onclick^="toDetail"]').filter(isVisible);
        if (ls.length) return ls;
        return visibleOne(document.querySelectorAll('.no-found')) ? [] : null;
      }, 10000);
      if (!links) return ctx.fail('搜索结果没有出来');
      const rowText = (a) => textOf(a.closest('li,tr,div'));
      const rowName = (a) => rowText(a).split('选择企业')[0].trim();
      const cands = links.map(rowText);
      const hits = code ? links : links.filter((a) => rowName(a) === name);
      if (hits.length !== 1) {
        ctx.candidates(cands);
        return ctx.fail(hits.length ? `「${code || name}」命中 ${hits.length} 家企业，请人工选择` : `没有完全匹配「${code || name}」的企业`);
      }
      hits[0].click();
      const save = await waitUntil(() => visibleOne(document.querySelectorAll('#corperationSave')), 8000);
      if (!save) return ctx.fail('企业详情没有出来（#corperationSave 不可见）');
      const detail = textOf(document.getElementById('confirm'));
      if (code && !detail.includes(code)) {
        ctx.candidates([detail.slice(0, 200)]);
        return ctx.fail('企业详情里的信用代码对不上，请人工核对');
      }
      if (name && !code && !detail.includes(name)) return ctx.fail('企业详情里的名称对不上，请人工核对');
      setTimeout(() => save.click(), 50);
      return ctx.ok(rowName(hits[0]));
    },

    // 电商平台弹窗：dspt_data_map 是 [{ ptcode, ptname, lb }]；清单里没有就走「其他」页签（lb=99）手填
    '12315.platform': async (ctx) => {
      const name = str(lookup('电商平台')).trim();
      if (!name) return ctx.fail('缺少资料：电商平台');
      const w = window;
      if (typeof w.showPlatform !== 'function') return ctx.fail('页面上没有 showPlatform()');
      w.showPlatform();
      const map = await waitUntil(() => (Array.isArray(w.dspt_data_map) && w.dspt_data_map.length ? w.dspt_data_map : null), 8000);
      if (!map) return ctx.fail('电商平台清单没有加载出来（dspt_data_map）');
      const clickOne = async (sel) => {
        const el = await waitUntil(() => safeQueryAll(sel)[0], 3000);
        if (!el) return false;
        el.click();
        await sleep(200);
        return true;
      };
      const hit = map.find((x) => x && str(x.ptname).trim() === name);
      if (hit) {
        if (!(await clickOne(`#dspt_div .dspt_tab[value="${cssEsc(str(hit.lb))}"]`))) return ctx.fail(`找不到平台页签 ${hit.lb}`);
        if (!(await clickOne(`#dspt_data .dspt_data_wrap > [value="${cssEsc(str(hit.ptcode))}"]`)))
          return ctx.fail(`找不到平台「${name}」（代码 ${hit.ptcode}）`);
      } else {
        if (chars(name) > 20) return ctx.fail(`清单里没有「${name}」，手填名称不能超过 20 字`);
        if (!(await clickOne('#dspt_div .dspt_tab[value="99"]'))) return ctx.fail(`清单里没有「${name}」，也找不到「其他」页签`);
        const qt = await waitUntil(() => document.getElementById('dsptname_qt'), 2000);
        if (!qt) return ctx.fail('找不到「其他」平台名称输入框 #dsptname_qt');
        setNativeValue(qt, name);
        fire(qt, ['input', 'keyup', 'change']);
      }
      // 有企业名称就举报「入驻商户」（2），否则举报平台本身（1）
      const merchant = str(lookup('公司名称')).trim();
      if (!(await clickOne(`#dspt_data .check-item[value="${merchant ? 2 : 1}"], .check-item[value="${merchant ? 2 : 1}"]`)))
        return ctx.fail('找不到举报对象类型选项 .check-item');
      if (merchant) {
        const rz = document.getElementById('dsptrzsh_text');
        if (!rz) return ctx.fail('找不到入驻商户名称输入框 #dsptrzsh_text');
        if (chars(merchant) > 50) return ctx.fail('公司名称超过 50 字，入驻商户名称填不下');
        setNativeValue(rz, merchant);
        fire(rz, ['input', 'keyup', 'change']);
      }
      if (typeof w.dspt_submit_toggle === 'function') w.dspt_submit_toggle();
      const btn = document.getElementById('dspt_submit_btn');
      if (!btn) return ctx.fail('找不到电商平台弹窗的确定按钮');
      if (btn.hasAttribute('disabled')) return ctx.fail('电商平台弹窗的确定按钮不可点，请检查平台和商户名称');
      btn.click();
      await sleep(300);
      const shown = str((document.getElementById('dsptname') || {}).value).trim();
      if (shown !== name) {
        ctx.actual(shown);
        return ctx.fail('电商平台没有写进表单');
      }
      if (hit && str((document.getElementById('dsptcode') || {}).value) !== str(hit.ptcode)) return ctx.fail('平台代码与清单不一致');
      return ctx.ok(hit ? `页签 ${hit.lb}，平台代码 ${hit.ptcode}` : '「其他」页签手填');
    },
  };

  // ───────────────────────── 配方校验 ─────────────────────────

  const ACTIONS = {
    fill: ['target', 'value'],
    check: ['target'],
    select: ['target', 'value'],
    typeAndPick: ['target', 'options', 'value'],
    cascade: ['target', 'levels', 'value'],
    click: [],
    call: ['fn'],
    waitFor: [],
    upload: ['target'],
    builtin: ['name'],
  };
  const KNOWN_KEYS = new Set(['do', 'label', 'target', 'value', 'required', 'when', 'timeout', 'trigger', 'triggerArgs', 'blur',
    'verify', 'verifyTarget', 'verifyNonEmpty', 'settle', 'options', 'levels', 'text', 'defer', 'waitEnabled', 'fn', 'args',
    'global', 'enabled', 'notClass', 'checked', 'queue', 'name']);
  const FN_RE = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/;

  function isSelectorList(v) {
    return Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === 'string' && s.trim());
  }

  function validateRecipe(r, idx) {
    const errors = [];
    const where = `配方${r && r.id ? `「${r.id}」` : `#${idx + 1}`}`;
    const err = (path, msg) => errors.push(`${where} ${path}：${msg}`);
    if (!r || typeof r !== 'object') return [`${where}：必须是对象`];
    if (typeof r.id !== 'string' || !r.id) err('id', '缺少');
    if (typeof r.name !== 'string' || !r.name) err('name', '缺少');
    if (!Number.isInteger(r.version)) err('version', '必须是整数');
    const hosts = r.match && (Array.isArray(r.match.host) ? r.match.host : [r.match.host]);
    if (!hosts || !hosts.every((h) => typeof h === 'string' && h)) err('match.host', '缺少');
    if (!Array.isArray(r.steps) || !r.steps.length) {
      err('steps', '至少要有一步');
      return errors;
    }
    r.steps.forEach((s, si) => {
      const sp = `steps[${si}]`;
      if (!s || typeof s !== 'object') return err(sp, '必须是对象');
      if (typeof s.name !== 'string' || !s.name) err(`${sp}.name`, '缺少');
      if (typeof s.path !== 'string') err(`${sp}.path`, '缺少');
      else
        try {
          new RegExp(s.path);
        } catch (e) {
          err(`${sp}.path`, '不是合法的正则');
        }
      if (s.validate != null && !VALIDATORS[s.validate]) err(`${sp}.validate`, `未知的校验「${s.validate}」`);
      if (s.submit != null && !isSelectorList(s.submit)) err(`${sp}.submit`, '必须是选择器数组');
      if (!Array.isArray(s.actions)) return err(`${sp}.actions`, '必须是数组');
      s.actions.forEach((a, ai) => {
        const ap = `${sp}.actions[${ai}]`;
        if (!a || typeof a !== 'object') return err(ap, '必须是对象');
        if (!Object.prototype.hasOwnProperty.call(ACTIONS, a.do)) return err(`${ap}.do`, `未知动作「${a.do}」`);
        for (const k of ACTIONS[a.do]) if (a[k] == null || a[k] === '') err(`${ap}.${k}`, `${a.do} 动作缺少 ${k}`);
        if (a.target != null && !isSelectorList(a.target)) err(`${ap}.target`, '必须是非空的选择器数组');
        if (a.verifyTarget != null && !isSelectorList(a.verifyTarget)) err(`${ap}.verifyTarget`, '必须是选择器数组');
        if (a.levels != null && !isSelectorList(a.levels)) err(`${ap}.levels`, '必须是选择器数组');
        if (a.options != null && typeof a.options !== 'string') err(`${ap}.options`, '必须是选择器');
        if (a.value != null && typeof a.value !== 'string') err(`${ap}.value`, '必须是文字或模板');
        if (a.when != null && (typeof a.when !== 'string' || !WHEN_RE.test(a.when)))
          err(`${ap}.when`, '只支持 {{字段}}、{{字段}}==值、{{字段}}!=值');
        for (const k of ['fn', 'trigger', 'global'])
          if (a[k] != null && (typeof a[k] !== 'string' || !FN_RE.test(a[k]))) err(`${ap}.${k}`, '必须是函数/变量名，不能是代码');
        for (const k of ['args', 'triggerArgs'])
          if (a[k] != null && (!Array.isArray(a[k]) || !a[k].every((x) => x === null || ['string', 'number', 'boolean'].includes(typeof x))))
            err(`${ap}.${k}`, '只能是字面量数组');
        if (a.do === 'click' && a.target == null && typeof a.text !== 'string') err(ap, 'click 动作需要 target 或 text');
        if (a.do === 'waitFor' && a.target == null && a.global == null) err(ap, 'waitFor 动作需要 target 或 global');
        if (a.do === 'builtin' && a.name != null && !BUILTINS[a.name]) err(`${ap}.name`, `未知的内置动作「${a.name}」`);
        if (a.timeout != null && !(Number.isFinite(a.timeout) && a.timeout >= 0)) err(`${ap}.timeout`, '必须是非负数字（毫秒）');
        for (const k of Object.keys(a))
          if (!KNOWN_KEYS.has(k)) err(`${ap}.${k}`, '未知选项（拼写错误？）');
        for (const k of ['required', 'blur', 'verify', 'defer', 'checked', 'enabled'])
          if (a[k] != null && typeof a[k] !== 'boolean') err(`${ap}.${k}`, '必须是 true 或 false');
        for (const k of ['settle', 'waitEnabled'])
          if (a[k] != null && !(Number.isFinite(a[k]) && a[k] >= 0)) err(`${ap}.${k}`, '必须是非负数字（毫秒）');
        if (a.verifyNonEmpty != null && !isSelectorList(a.verifyNonEmpty)) err(`${ap}.verifyNonEmpty`, '必须是选择器数组');
        if (a.notClass != null && (typeof a.notClass !== 'string' || !/^[\w-]+$/.test(a.notClass))) err(`${ap}.notClass`, '必须是单个类名');
      });
    });
    return errors;
  }

  // 配方会调用的页面函数清单，导入第三方配方时给用户确认
  function listCalls(r) {
    const set = new Set();
    for (const s of (r && r.steps) || [])
      for (const a of (s && s.actions) || []) {
        if (a && a.fn) set.add(a.fn);
        if (a && a.trigger) set.add(a.trigger);
        if (a && a.do === 'builtin') set.add(`内置:${a.name}`);
      }
    return Array.from(set);
  }

  if (mode === 'validate') {
    const recipeResults = recipes.map((r, i) => ({ id: r && r.id, errors: validateRecipe(r, i), calls: listCalls(r) }));
    const profileErrors = profile ? validateProfile(profile) : [];
    const checks = [];
    if (profile) {
      const names = new Set(Array.isArray(input.validators) ? input.validators : []);
      for (const r of recipes)
        if (r && r.profileType === profile.type)
          for (const s of r.steps || []) if (s && s.validate && VALIDATORS[s.validate]) names.add(s.validate);
      for (const n of names) {
        if (!VALIDATORS[n]) checks.push({ validator: n, errors: [`未知的校验「${n}」`] });
        else checks.push({ validator: n, errors: VALIDATORS[n]() });
      }
    }
    const ok =
      recipeResults.every((r) => !r.errors.length) && !profileErrors.length && checks.every((c) => !c.errors.length);
    return { engine: VERSION, mode, ok, recipes: recipeResults, profileErrors, checks };
  }

  // ───────────────────────── DOM 工具 ─────────────────────────

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  async function waitUntil(fn, timeout) {
    const end = Date.now() + (timeout || 0);
    for (;;) {
      let v;
      try {
        v = fn();
      } catch (e) {
        v = null;
      }
      if (v) return v;
      if (Date.now() >= end) return null;
      await sleep(100);
    }
  }
  function cssEsc(s) {
    return window.CSS && CSS.escape ? CSS.escape(s) : str(s).replace(/["\\]/g, '\\$&');
  }
  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    if (!el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  }
  function visibleOne(list) {
    return Array.from(list).find(isVisible) || null;
  }
  function textOf(el) {
    return str(el && (el.innerText || el.textContent)).replace(/\s+/g, ' ').trim();
  }
  function safeQueryAll(sel) {
    try {
      return Array.from(document.querySelectorAll(sel));
    } catch (e) {
      return [];
    }
  }
  // 多候选选择器：每轮按顺序试，直到超时；返回用上的是第几个
  async function findTarget(selectors, timeout, opts) {
    const want = (opts && opts.visible) === false ? (el) => !!el : isVisible;
    return waitUntil(() => {
      for (let i = 0; i < selectors.length; i++) {
        const el = safeQueryAll(selectors[i]).find(want);
        if (el) return { el, selector: selectors[i], index: i };
      }
      return null;
    }, timeout);
  }
  function setNativeValue(el, value) {
    const proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : el instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
  }
  function fire(el, types) {
    for (const t of types) {
      const ev =
        t === 'keyup' || t === 'keydown'
          ? new KeyboardEvent(t, { bubbles: true })
          : new Event(t, { bubbles: true, cancelable: true });
      el.dispatchEvent(ev);
    }
  }
  function resolveFn(path) {
    const parts = path.split('.');
    let owner = window;
    let cur = window;
    for (const p of parts) {
      if (cur == null) return null;
      owner = cur;
      cur = cur[p];
    }
    return typeof cur === 'function' ? { fn: cur, owner } : null;
  }
  function readValue(el) {
    if (!el) return '';
    if (el.isContentEditable) return textOf(el);
    if (el instanceof HTMLSelectElement) {
      const o = el.options[el.selectedIndex];
      return o ? o.text.trim() : '';
    }
    if ('value' in el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return str(el.value);
    return textOf(el);
  }
  function isPassword(el) {
    return el && el.tagName === 'INPUT' && /password/i.test(el.type);
  }
  function isEditable(el) {
    return !!el && !el.disabled && !el.readOnly;
  }
  function describe(el) {
    return {
      selector: uniqueSelector(el),
      tag: el.tagName.toLowerCase(),
      type: str(el.type),
      label: labelText(el),
      name: str(el.getAttribute('name')),
      id: el.id || '',
      placeholder: str(el.getAttribute('placeholder')),
      autocomplete: str(el.getAttribute('autocomplete')),
      required: !!el.required,
    };
  }
  function uniqueSelector(el) {
    if (el.id && document.querySelectorAll(`#${cssEsc(el.id)}`).length === 1) return `#${cssEsc(el.id)}`;
    const name = el.getAttribute('name');
    if (name) {
      const s = `${el.tagName.toLowerCase()}[name="${cssEsc(name)}"]`;
      if (document.querySelectorAll(s).length === 1) return s;
    }
    const path = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.body) {
      const tag = cur.tagName.toLowerCase();
      const parent = cur.parentElement;
      if (!parent) break;
      const same = Array.from(parent.children).filter((c) => c.tagName === cur.tagName);
      path.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(cur) + 1})` : tag);
      if (parent.id) {
        path.unshift(`#${cssEsc(parent.id)}`);
        break;
      }
      cur = parent;
    }
    return path.join(' > ');
  }
  function labelText(el) {
    const clean = (s) => str(s).replace(/[\s:：*＊]+/g, ' ').trim();
    if (el.labels && el.labels.length) return clean(Array.from(el.labels).map(textOf).join(' '));
    const ids = el.getAttribute('aria-labelledby');
    if (ids) {
      const t = ids
        .split(/\s+/)
        .map((id) => document.getElementById(id))
        .filter(Boolean)
        .map(textOf)
        .join(' ');
      if (t) return clean(t);
    }
    // 同行左侧文字：往上找几层，取元素之前的兄弟文字
    let node = el;
    for (let depth = 0; depth < 3 && node && node.parentElement; depth++) {
      let prev = node.previousElementSibling;
      while (prev) {
        if (!prev.querySelector('input,textarea,select')) {
          const t = clean(textOf(prev));
          if (t && t.length <= 30) return t;
        }
        break;
      }
      let sib = node.previousSibling;
      while (sib && sib.nodeType === 3 && !sib.textContent.trim()) sib = sib.previousSibling;
      if (sib && sib.nodeType === 3) return clean(sib.textContent);
      node = node.parentElement;
    }
    return '';
  }
  function highlight(el) {
    el.style.outline = '3px solid #f59e0b';
    el.style.outlineOffset = '2px';
    el.setAttribute('data-fillduck', 'submit');
    try {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch (e) {
      /* 老浏览器没有平滑滚动 */
    }
  }

  // ───────────────────────── 通用匹配 ─────────────────────────

  const AUTOCOMPLETE = {
    name: 'name', 'given-name': 'name', 'family-name': 'name',
    tel: 'mobile', 'tel-national': 'mobile', email: 'email',
    'street-address': 'address', 'address-line1': 'address',
    'address-level1': 'province', 'address-level2': 'city', 'address-level3': 'district',
    'postal-code': 'postcode', organization: 'company', 'organization-title': 'title', url: 'website',
  };
  // 顺序有讲究：先判「公司名称」再判「姓名」，先判「邮编」再判「地址」
  const KEYWORDS = [
    ['creditCode', /统一社会信用代码|社会信用代码|信用代码|credit.?code|uscc|tax.?id/i],
    ['company', /公司|企业名称|单位名称|组织名称|company|organi[sz]ation|corp/i],
    ['title', /职位|职务|岗位|job.?title|position/i],
    ['email', /邮箱|电子邮件|e-?mail/i],
    ['postcode', /邮编|邮政编码|zip|post(al)?.?code/i],
    ['mobile', /手机|电话|联系方式|mobile|phone|(^|[^a-z])tel([^a-z]|$)|cell/i],
    ['province', /省份|所在省|^省$|province/i],
    ['city', /城市|所在市|^市$|city/i],
    ['district', /区县|县区|所在区|^区$|district|county/i],
    ['address', /地址|住址|街道|address|street/i],
    ['website', /网址|网站|主页|website|homepage|(^|[^a-z])url([^a-z]|$)/i],
    ['name', /姓名|联系人|真实姓名|称呼|^name$|full.?name|your.?name|contact.?name|real.?name/i],
  ];

  function guessField(el) {
    const ac = str(el.getAttribute('autocomplete')).toLowerCase().split(/\s+/).pop();
    if (AUTOCOMPLETE[ac]) return { key: AUTOCOMPLETE[ac], by: `autocomplete=${ac}` };
    const label = labelText(el);
    if (label) {
      const custom = profile && Array.isArray(profile.custom) ? profile.custom : [];
      const c = custom.find((x) => x && x.label && x.label === label);
      if (c) return { key: c.label, by: `标签「${label}」` };
      for (const [key, re] of KEYWORDS) if (re.test(label)) return { key, by: `标签「${label}」` };
    }
    for (const attr of ['name', 'id', 'placeholder', 'aria-label']) {
      const v = str(el.getAttribute(attr));
      if (!v) continue;
      for (const [key, re] of KEYWORDS) if (re.test(v)) return { key, by: `${attr}「${v}」` };
    }
    return null;
  }

  function formFields() {
    return safeQueryAll('input, textarea, select').filter((el) => {
      if (el.tagName === 'INPUT' && /^(hidden|submit|button|image|reset|checkbox|radio)$/i.test(el.type)) return false;
      return isVisible(el);
    });
  }

  if (mode === 'scan') {
    const fields = formFields().map((el) => {
      const d = describe(el);
      if (isPassword(el)) d.value = '';
      else d.value = readValue(el);
      if (el instanceof HTMLSelectElement) d.options = Array.from(el.options).map((o) => o.text.trim());
      d.editable = isEditable(el) && !isPassword(el) && el.type !== 'file';
      const g = guessField(el);
      d.guess = g ? g.key : null;
      return d;
    });
    return { engine: VERSION, mode, url: location.href, fields };
  }

  // ───────────────────────── 执行 ─────────────────────────

  const results = [];
  const verifiers = [];

  async function runGeneric() {
    for (const el of formFields()) {
      const d = describe(el);
      const label = d.label || d.placeholder || d.name || d.id || d.selector;
      if (isPassword(el)) {
        results.push({ label, status: 'skip', reason: '密码框不填', selector: d.selector });
        continue;
      }
      if (el.type === 'file') {
        results.push({ label, status: 'skip', reason: '文件框不填', selector: d.selector });
        continue;
      }
      if (!isEditable(el)) {
        results.push({ label, status: 'skip', reason: '只读或禁用', selector: d.selector });
        continue;
      }
      const g = guessField(el);
      if (!g) {
        results.push({ label, status: 'skip', reason: '未匹配', selector: d.selector, unmatched: d });
        continue;
      }
      const v = str(lookup(g.key)).trim();
      if (!v) {
        results.push({ label, status: 'skip', reason: `资料卡没有「${fieldLabel(g.key)}」`, selector: d.selector, by: g.by });
        continue;
      }
      if (str(readValue(el)).trim() && !(el instanceof HTMLSelectElement && el.selectedIndex <= 0)) {
        results.push({ label, status: 'skip', reason: '已有内容，保持原值', selector: d.selector, by: g.by });
        continue;
      }
      if (el instanceof HTMLSelectElement) {
        const idx = Array.from(el.options).findIndex((o) => o.text.trim() === v || o.value === v);
        if (idx < 0) {
          results.push({ label, status: 'fail', reason: `下拉里没有「${v}」`, selector: d.selector, by: g.by, candidates: Array.from(el.options).map((o) => o.text.trim()) });
          continue;
        }
        el.selectedIndex = idx;
        fire(el, ['input', 'change']);
      } else {
        setNativeValue(el, v);
        fire(el, ['input', 'change']);
      }
      const r = { label, status: 'ok', value: v, selector: d.selector, by: g.by };
      results.push(r);
      verifiers.push(() => checkEquals(r, el, v));
    }
  }

  function fieldLabel(key) {
    const std = STD_FIELDS.find((f) => f.key === key);
    return std ? std.label : key;
  }

  function checkEquals(r, el, expected) {
    const actual = readValue(el);
    const ok = el instanceof HTMLSelectElement ? actual === expected || el.value === expected : actual === expected;
    if (!ok && r.status === 'ok') {
      r.status = 'fail';
      r.reason = '写入后被页面改掉或清空';
      r.actual = actual || '（空）';
    }
  }

  // 返回 { el, selector, note } 或写入失败结果后返回 null
  async function locate(a, r, opts) {
    const found = await findTarget(a.target, a.timeout == null ? 3000 : a.timeout, opts);
    if (!found) {
      r.status = 'fail';
      r.reason = `找不到元素：${a.target.join(' | ')}`;
      return null;
    }
    r.selector = found.selector;
    if (found.index > 0) r.note = `首选选择器失效，用了备用选择器 #${found.index + 1}`;
    return found;
  }

  function callPage(name, args, r) {
    const ref = resolveFn(name);
    if (!ref) {
      r.status = 'fail';
      r.reason = `页面上没有函数 ${name}()`;
      return false;
    }
    const realArgs = (args || []).map((x) => (typeof x === 'string' ? render(x).value : x));
    try {
      ref.fn.apply(ref.owner, realArgs);
      return true;
    } catch (e) {
      r.status = 'fail';
      r.reason = `${name}() 出错：${e && e.message}`;
      return false;
    }
  }

  function exactPick(nodes, text) {
    return nodes.find((n) => isVisible(n) && (textOf(n) === text || str(n.getAttribute('title')).trim() === text));
  }
  function candidatesOf(nodes) {
    return Array.from(new Set(nodes.filter(isVisible).map((n) => textOf(n) || str(n.getAttribute('title'))).filter(Boolean))).slice(0, 40);
  }

  const BACK_TEXT = /上一步|返回上一|上一页/;
  const SUBMIT_TEXT = /提交|保存|确认举报|确认投诉/;
  const DANGEROUS_FN = /save|submit|prev|back/i;

  async function runAction(a, step, ai) {
    await runActionInner(a, step, ai);
    const r = results[results.length - 1];
    if (a.verifyNonEmpty && r && r.status === 'ok')
      verifiers.push(() => {
        for (const s of a.verifyNonEmpty) {
          const el = safeQueryAll(s)[0];
          if (!el || !str(readValue(el)).trim()) {
            if (r.status === 'ok') {
              r.status = 'fail';
              r.reason = `${s} 为空（显示值与隐藏代码不一致）`;
            }
            return;
          }
        }
      });
  }

  async function runActionInner(a, step, ai) {
    const r = { i: ai, do: a.do, label: a.label || a.name || (a.target && a.target[0]) || a.text || a.fn || a.global || a.do, status: 'ok' };
    results.push(r);
    if (a.when && !evalWhen(a.when)) {
      r.status = 'skip';
      r.reason = `条件不满足：${a.when}`;
      return;
    }
    let value = '';
    if (a.value != null) {
      const rendered = render(a.value);
      value = rendered.value.trim();
      if (!value) {
        if (a.required) {
          r.status = 'fail';
          r.reason = `缺少资料：${rendered.missing.join('、') || a.value}`;
        } else {
          r.status = 'skip';
          r.reason = `资料为空：${rendered.missing.join('、') || a.value}`;
        }
        return;
      }
      r.value = value;
    }
    const timeout = a.timeout == null ? 3000 : a.timeout;
    const risky = [a.fn, a.trigger].find((n) => n && DANGEROUS_FN.test(n));
    if (step.final && risky) {
      r.status = 'fail';
      r.reason = `安全规则：最终步不调用 ${risky}()`;
      return;
    }

    switch (a.do) {
      case 'fill': {
        const f = await locate(a, r);
        if (!f) return;
        const el = f.el;
        if (isPassword(el)) {
          r.status = 'skip';
          r.reason = '密码框不填';
          return;
        }
        if (el.isContentEditable) el.textContent = value;
        else setNativeValue(el, value);
        fire(el, ['input', 'change', ...(a.blur ? ['blur'] : [])]);
        if (a.trigger && !callPage(a.trigger, a.triggerArgs, r)) return;
        verifiers.push(() => checkEquals(r, verifyEl(a, el), value));
        return;
      }
      case 'select': {
        const f = await locate(a, r);
        if (!f) return;
        const el = f.el;
        const opts = Array.from(el.options || []);
        const idx = opts.findIndex((o) => o.text.trim() === value);
        const idx2 = idx >= 0 ? idx : opts.findIndex((o) => o.value === value);
        if (idx2 < 0) {
          r.status = 'fail';
          r.reason = `下拉里没有「${value}」`;
          r.candidates = opts.map((o) => o.text.trim());
          return;
        }
        el.selectedIndex = idx2;
        fire(el, ['input', 'change']);
        if (a.trigger && !callPage(a.trigger, a.triggerArgs, r)) return;
        const want = opts[idx2].text.trim();
        verifiers.push(() => checkEquals(r, el, want));
        return;
      }
      case 'check': {
        const found = await findTarget(a.target, timeout, { visible: false });
        if (!found) {
          r.status = 'fail';
          r.reason = `找不到元素：${a.target.join(' | ')}`;
          return;
        }
        r.selector = found.selector;
        let el = found.el;
        if (value) {
          const group = safeQueryAll(found.selector);
          const after = (x) => str(x.nextSibling && (x.nextSibling.textContent || '')).trim();
          el = group.find((x) => x.value === value || labelText(x) === value || textOf(x.closest('label')) === value || after(x) === value);
          if (!el) {
            r.status = 'fail';
            r.reason = `没有值或文字为「${value}」的选项`;
            r.candidates = group.map((x) => labelText(x) || x.value);
            return;
          }
        }
        const want = a.checked !== false;
        if (el.checked !== want) el.click();
        if (el.checked !== want) {
          el.checked = want;
          fire(el, ['change']);
        }
        verifiers.push(() => {
          if (el.checked !== want && r.status === 'ok') {
            r.status = 'fail';
            r.reason = '勾选状态被页面改掉';
            r.actual = String(el.checked);
          }
        });
        return;
      }
      case 'typeAndPick': {
        const f = await locate(a, r);
        if (!f) return;
        const el = f.el;
        setNativeValue(el, value);
        fire(el, ['input', 'keyup', 'change']);
        if (a.trigger && !callPage(a.trigger, a.triggerArgs, r)) return;
        const pick = await waitUntil(() => exactPick(safeQueryAll(a.options), value), timeout);
        if (!pick) {
          r.status = 'fail';
          r.reason = `没有文字完全一致的候选项「${value}」`;
          r.candidates = candidatesOf(safeQueryAll(a.options));
          return;
        }
        pick.click();
        await sleep(a.settle == null ? 200 : a.settle);
        if (a.verify !== false) verifiers.push(() => checkEquals(r, verifyEl(a, el), value));
        return;
      }
      case 'cascade': {
        const f = await locate(a, r);
        if (!f) return;
        const parts = value.split('/').map((s) => s.trim()).filter(Boolean);
        if (parts.length !== a.levels.length) {
          r.status = 'fail';
          r.reason = `「${value}」有 ${parts.length} 级，配方需要 ${a.levels.length} 级（用 / 分隔）`;
          return;
        }
        f.el.click();
        for (let i = 0; i < parts.length; i++) {
          const pick = await waitUntil(() => exactPick(safeQueryAll(a.levels[i]), parts[i]), timeout);
          if (!pick) {
            r.status = 'fail';
            r.reason = `第 ${i + 1} 级找不到「${parts[i]}」`;
            r.candidates = candidatesOf(safeQueryAll(a.levels[i]));
            return;
          }
          pick.click();
          await sleep(a.settle == null ? 250 : a.settle);
        }
        verifiers.push(() => {
          const el = verifyEl(a, f.el);
          const actual = readValue(el);
          let pos = 0;
          const inOrder = parts.every((p) => {
            const at = actual.indexOf(p, pos);
            if (at < 0) return false;
            pos = at + p.length;
            return true;
          });
          if (!inOrder && r.status === 'ok') {
            r.status = 'fail';
            r.reason = '选择结果被页面改掉或清空';
            r.actual = actual || '（空）';
          }
        });
        return;
      }
      case 'click': {
        let el = null;
        if (a.target && value) {
          el = await waitUntil(() => {
            for (const s of a.target) {
              const hit = safeQueryAll(s).find((n) => textOf(n) === value || str(n.textContent).trim() === value || str(n.getAttribute('title')).trim() === value);
              if (hit) {
                r.selector = s;
                return hit;
              }
            }
            return null;
          }, timeout);
          if (!el) {
            r.status = 'fail';
            r.reason = `没有文字为「${value}」的选项`;
            r.candidates = Array.from(new Set(a.target.flatMap(safeQueryAll).map((n) => str(n.textContent).trim()).filter(Boolean))).slice(0, 40);
            return;
          }
        } else if (a.target) {
          const f = await locate(a, r);
          if (!f) return;
          el = f.el;
        } else {
          el = await waitUntil(
            () =>
              safeQueryAll('a, button, input[type=button], input[type=submit], [onclick], [role=button], label, li, span').find(
                (n) => isVisible(n) && (textOf(n) === a.text || str(n.value).trim() === a.text),
              ),
            timeout,
          );
          if (!el) {
            r.status = 'fail';
            r.reason = `找不到文字为「${a.text}」的可点元素`;
            return;
          }
        }
        const t = textOf(el) || str(el.value);
        const isSubmit = step.submit && step.submit.some((s) => safeQueryAll(s).includes(el));
        if (BACK_TEXT.test(t) || (step.final && (isSubmit || SUBMIT_TEXT.test(t)))) {
          r.status = 'fail';
          r.reason = `安全规则：不替你点「${t}」`;
          return;
        }
        if (a.waitEnabled) {
          const on = await waitUntil(() => !el.disabled && !el.classList.contains('disabled') && el, a.waitEnabled);
          if (!on) {
            r.status = 'fail';
            r.reason = '按钮一直不可点';
            return;
          }
        }
        // 会整页跳转的按钮延迟点，保证结果先返回
        if (a.defer) setTimeout(() => el.click(), 50);
        else el.click();
        if (a.settle) await sleep(a.settle);
        return;
      }
      case 'call': {
        if (!callPage(a.fn, a.args, r)) return;
        if (a.settle) await sleep(a.settle);
        return;
      }
      case 'waitFor': {
        let hit;
        if (a.global) hit = await waitUntil(() => { const v = a.global.split('.').reduce((o, k) => (o == null ? o : o[k]), window); return v != null && v !== '' ; }, timeout);
        else {
          const f = await locate(a, r);
          if (!f) return;
          hit = await waitUntil(
            () =>
              (!a.enabled || (!f.el.disabled && !f.el.classList.contains('disabled'))) &&
              (!a.notClass || !f.el.classList.contains(a.notClass)),
            timeout,
          );
        }
        if (!hit) {
          r.status = 'fail';
          r.reason = `等待超时：${a.global || a.target.join(' | ')}`;
        }
        return;
      }
      case 'upload': {
        const found = await findTarget(a.target, timeout, { visible: false });
        if (!found) {
          r.status = 'fail';
          r.reason = `找不到文件框：${a.target.join(' | ')}`;
          return;
        }
        r.selector = found.selector;
        if (!files.length) {
          r.status = a.required ? 'fail' : 'skip';
          r.reason = '没有选择附件';
          return;
        }
        const queueBefore = a.queue ? safeQueryAll(a.queue).length : 0;
        const dt = new DataTransfer();
        for (const f of files) {
          const bin = atob(str(f.base64));
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          dt.items.add(new File([bytes], f.name, { type: f.type || 'application/octet-stream' }));
        }
        found.el.files = dt.files;
        fire(found.el, ['input', 'change']);
        r.value = files.map((f) => f.name).join('、');
        if (a.queue) {
          const grew = await waitUntil(() => safeQueryAll(a.queue).length >= queueBefore + files.length, timeout);
          if (!grew) {
            r.status = 'fail';
            r.reason = '附件没有进入待上传队列';
            r.actual = `队列 ${safeQueryAll(a.queue).length} 项`;
          }
        }
        return;
      }
      case 'builtin': {
        const ctx = {
          ok: (note) => {
            if (note) r.note = note;
          },
          fail: (reason) => {
            r.status = 'fail';
            r.reason = reason;
          },
          candidates: (list) => {
            r.candidates = list;
          },
          actual: (v) => {
            r.actual = v;
          },
        };
        try {
          await BUILTINS[a.name](ctx, a);
        } catch (e) {
          r.status = 'fail';
          r.reason = `内置动作出错：${e && e.message}`;
        }
        return;
      }
    }
  }

  function verifyEl(a, fallback) {
    if (!a.verifyTarget) return fallback;
    for (const s of a.verifyTarget) {
      const el = safeQueryAll(s)[0];
      if (el) return el;
    }
    return fallback;
  }

  function hostMatches(r) {
    const hosts = Array.isArray(r.match.host) ? r.match.host : [r.match.host];
    return hosts.includes(location.hostname);
  }

  function summarize(extra) {
    const order = { fail: 0, skip: 1, ok: 2 };
    const sorted = results.map((r, i) => ({ r, i })).sort((x, y) => order[x.r.status] - order[y.r.status] || x.i - y.i).map((x) => x.r);
    const count = (s) => results.filter((r) => r.status === s).length;
    return {
      engine: VERSION,
      mode,
      url: location.href,
      ok: count('fail') === 0 && !(extra.errors && extra.errors.length),
      summary: { ok: count('ok'), fail: count('fail'), skip: count('skip') },
      results: sorted,
      unmatched: results.filter((r) => r.unmatched).map((r) => r.unmatched),
      ...extra,
    };
  }

  // 1. 选配方
  let recipe = null;
  let step = null;
  if (!input.forceGeneric)
    for (const r of recipes) {
      if (!r || !r.match || !r.steps) continue;
      try {
        if (!hostMatches(r)) continue;
      } catch (e) {
        continue;
      }
      const s = r.steps.find((x) => {
        try {
          return x && new RegExp(x.path).test(location.pathname);
        } catch (e) {
          return false;
        }
      });
      if (s) {
        recipe = r;
        step = s;
        break;
      }
    }

  if (profile) {
    const pe = validateProfile(profile);
    if (pe.length) return summarize({ recipe: recipe ? recipe.name : '通用配方', errors: pe, hint: '资料卡格式不对，先修好再填' });
  }

  if (!recipe) {
    await runGeneric();
    for (const v of verifiers) v();
    return summarize({
      recipe: '通用配方',
      final: false,
      hint: '通用配方只填空着的框，不会点任何提交按钮；请核对后自己提交。未匹配的框可以交给 agent 处理。',
    });
  }

  // 2. 执行前校验：配方非法或资料不合规时，页面不做任何改动
  const recipeErrors = validateRecipe(recipe, 0);
  if (recipeErrors.length) return summarize({ recipe: recipe.name, step: step.name, errors: recipeErrors, hint: '配方有错，没有执行任何动作' });
  if (step.validate) {
    const ve = VALIDATORS[step.validate]();
    if (ve.length) return summarize({ recipe: recipe.name, step: step.name, errors: ve, hint: '资料没通过校验，页面没有任何改动' });
  }

  // 3. 按顺序执行动作（顺序就是依赖顺序）
  for (let i = 0; i < step.actions.length; i++) await runAction(step.actions[i], step, i);

  // 4. 全部做完再逐字段核对，暴露被联动清空的字段
  await sleep(300);
  for (const v of verifiers) v();

  // 5. 最终步：只高亮提交按钮，绝不点击
  let hint = step.hint || '';
  if (step.final) {
    for (const s of step.submit || []) for (const el of safeQueryAll(s)) highlight(el);
    const site = Object.keys(HINTS).find((k) => recipe.id.startsWith(k));
    hint = [site ? HINTS[site] : '请人工核对后提交。', step.hint].filter(Boolean).join('\n');
  }
  return summarize({ recipe: recipe.name, recipeId: recipe.id, step: step.name, final: !!step.final, hint });
}
