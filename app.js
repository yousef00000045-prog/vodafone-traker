/* ============================================================
   إدارة باقات فودافون — HTML/CSS/JS فقط (تخزين في المتصفح)
   الأدوار: admin (أنت) / intermediary (وسيط) / subscriber (مشترك)
   ============================================================ */

const STORE_KEY = 'vf_data_v1';
const SESSION_KEY = 'vf_session_v1';
const BILL_DAYS = [25, 7, 11]; // مواعيد الفواتير
const RESET_LEAD_DAYS = 5; // الدفع يفتح تاني (ريسيت الحالة) قبل يوم الفاتورة بـ 5 أيام

/* ---------- أدوات مساعدة ---------- */
const $ = (s, r = document) => r.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const money = n => (Number(n) || 0).toLocaleString('ar-EG') + ' ج.م';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* تحويل رقم مصري إلى صيغة واتساب (كود الدولة 20) */
function waNumber(raw) {
  let n = String(raw || '').replace(/[^\d]/g, '');
  if (!n) return '';
  if (n.startsWith('00')) n = n.slice(2);
  if (n.startsWith('20')) return n;
  if (n.startsWith('0')) n = n.slice(1);
  return '20' + n;
}
function waLink(number, text) {
  const n = waNumber(number);
  if (!n) return '';
  return 'https://wa.me/' + n + '?text=' + encodeURIComponent(text);
}
/* رابط انستجرام من يوزر أو لينك */
function igLink(v) {
  v = String(v || '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  return 'https://instagram.com/' + v.replace(/^@/, '');
}
function igHandle(v) {
  v = String(v || '').trim();
  if (!v) return '';
  const m = v.match(/instagram\.com\/([^\/?#]+)/i);
  return '@' + (m ? m[1] : v.replace(/^@/, ''));
}

/* أيقونة واتساب صغيرة تروح على رقم الشخص */
const WA_ICON_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="#25d366" aria-hidden="true"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 004.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0012.04 2zm5.8 14.13c-.24.68-1.2 1.28-1.97 1.42-.53.09-1.22.16-3.56-.76-3.06-1.24-5.03-4.36-5.18-4.56-.15-.2-1.24-1.65-1.24-3.15 0-1.5.79-2.24 1.07-2.55.28-.31.61-.38.81-.38.2 0 .41.01.58.01.19.01.44-.07.69.53.24.6.83 2.07.9 2.22.07.15.12.32.02.52-.1.2-.15.32-.3.5-.15.18-.32.4-.45.53-.15.15-.31.32-.13.63.18.31.79 1.3 1.69 2.11 1.16 1.03 2.14 1.35 2.45 1.5.31.15.49.13.67-.08.18-.2.77-.9.98-1.21.2-.31.41-.26.69-.15.28.1 1.77.83 2.07.98.31.15.51.22.58.34.07.12.07.72-.17 1.4z"/></svg>';

// رقم موبايل + أيقونة واتساب جنبه
function phoneWithWa(number) {
  const n = String(number || '').trim();
  if (!n) return '<span class="muted">—</span>';
  const link = waLink(n, '');
  const ico = link ? `<a class="wa-ico" href="${link}" target="_blank" rel="noopener" title="واتساب ${esc(n)}">${WA_ICON_SVG}</a>` : '';
  return `<span class="phone-cell">${ico}<span dir="ltr">${esc(n)}</span></span>`;
}

// نسخ نص للحافظة
function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => toast('تم النسخ ✅')).catch(() => toast('انسخ يدويًا'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('تم النسخ ✅'); } catch (e) { toast('انسخ يدويًا'); }
    document.body.removeChild(ta);
  }
}

/* تحويل "2026-07" إلى "يوليو 2026" */
function monthLabel(val) {
  if (!val) return '';
  const [y, m] = String(val).split('-');
  if (!y || !m) return val;
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });
}

/* ====== إعدادات Supabase ====== */
const SUPABASE_URL = 'https://lhbiakabujzhwbhrryxx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_35nam3ZKt7bVFWBboYYhQw_pKw3WfOt';
const STATE_ID = 1;
let sb = null;

function defaultData() {
  return {
    admin: { username: 'admin', password: 'admin123', whatsapp: '', instapay: '', vfcash: '' },
    intermediaries: [],
    providers: [],
    subscribers: []
  };
}

// توحيد شكل البيانات + ترقية الحقول القديمة
function migrate(d) {
  if (!d || typeof d !== 'object') return defaultData();
  if (!d.admin) d.admin = defaultData().admin;
  if (!d.intermediaries) d.intermediaries = [];
  if (!d.providers) d.providers = [];
  if (!d.subscribers) d.subscribers = [];
  [d.admin, ...d.intermediaries].forEach(a => {
    if (!a) return;
    if (a.vodafone && !a.vfcash) a.vfcash = a.vodafone;
    if (a.instagram && !a.instapay) a.instapay = a.instagram;
  });
  let n = 2;
  d.intermediaries.forEach(i => { if (!i.num) i.num = n; n = Math.max(n, i.num) + 1; });
  return d;
}

async function pullRemote() {
  const { data, error } = await sb.from('app_state').select('data').eq('id', STATE_ID).maybeSingle();
  if (error) throw error;
  return data ? data.data : null;
}

let _saveTimer = null;
async function pushRemote() {
  if (!sb) return;
  const { error } = await sb.from('app_state').upsert({ id: STATE_ID, data: DB }, { onConflict: 'id' });
  if (error) { console.error('save error', error); toast('⚠️ خطأ في الحفظ للسحابة'); }
}

// يحفظ محليًا فورًا (كاش) ويرفع للسحابة (debounce بسيط)
function saveData() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(DB)); } catch (e) {}
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(pushRemote, 200);
}

function getSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { return null; } }
function setSession(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
function clearSession() { localStorage.removeItem(SESSION_KEY); }

let DB = defaultData();

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), 2200);
}

/* ---------- النافذة المنبثقة ---------- */
function openModal(title, bodyHTML) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = bodyHTML;
  $('#modal').classList.remove('hidden');
}
function closeModal() { $('#modal').classList.add('hidden'); $('#modal-body').innerHTML = ''; }
$('#modal-close').addEventListener('click', closeModal);
$('.modal-backdrop').addEventListener('click', closeModal);

/* ---------- حساب موعد الفاتورة القادم ---------- */
function startOfToday() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function nextBillInfo(day) {
  const now = new Date();
  let d = new Date(now.getFullYear(), now.getMonth(), day);
  if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
    d = new Date(now.getFullYear(), now.getMonth() + 1, day);
  }
  const diff = Math.ceil((d - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  return { date: d, days: diff };
}

/* ---------- دورة الفوترة والريسيت التلقائي ----------
   لكل مشترك يوم فاتورة (مثال 25). الدفع بيفتح تاني (الحالة ترجع "مطلوب")
   قبل الفاتورة بـ RESET_LEAD_DAYS يوم (مثال يوم 20)، وبكده تبدأ فترة السداد.  */

// صيغة تاريخ محلية ثابتة YYYY-MM-DD (من غير أوفست التوقيت العالمي)
function ymdLocal(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// مفتاح الدورة الحالية = تاريخ آخر يوم فتح فيه الدفع (أحدث يوم ريسيت مرّ)
function activeCycleKey(billDate) {
  const today = startOfToday();
  const day = Number(billDate) || 1;
  for (let back = 0; back <= 3; back++) {
    const bill = new Date(today.getFullYear(), today.getMonth() - back, day);
    const reset = new Date(bill);
    reset.setDate(reset.getDate() - RESET_LEAD_DAYS);
    if (reset <= today) return ymdLocal(reset);
  }
  return ymdLocal(today);
}

// تاريخ فتح الدفع القادم (أقرب يوم ريسيت بعد النهارده) — للعرض
function nextResetDate(billDate) {
  const today = startOfToday();
  const day = Number(billDate) || 1;
  for (let fwd = 0; fwd <= 3; fwd++) {
    const bill = new Date(today.getFullYear(), today.getMonth() + fwd, day);
    const reset = new Date(bill);
    reset.setDate(reset.getDate() - RESET_LEAD_DAYS);
    if (reset > today) return reset;
  }
  return today;
}

// يمرّ على كل المشتركين ويصفّر حالة الدفع للي دخلوا دورة جديدة
function applyBillingResets() {
  let changed = false;
  (DB.subscribers || []).forEach(s => {
    const cycle = activeCycleKey(s.billDate);
    if (s.paid) {
      if (!s.paidCycle) {
        // بيانات قديمة اتدفعت قبل الميزة دي — اعتبرها للدورة الحالية عشان ماتترستش فجأة
        s.paidCycle = cycle; changed = true;
      } else if (s.paidCycle !== cycle) {
        // دخلنا دورة جديدة → رجّع الحالة "مطلوب"
        s.paid = false; s.paymentClaimed = false;
        delete s.paidCycle; delete s.claimCycle; changed = true;
      }
    } else if (s.paymentClaimed && s.claimCycle && s.claimCycle !== cycle) {
      // ادّعى الدفع في دورة فاتت واتصفّرت — نظّف الادعاء القديم
      s.paymentClaimed = false; delete s.claimCycle; changed = true;
    }
  });
  return changed;
}

/* ---------- المصادقة ---------- */
function tryLogin(username, password) {
  username = username.trim();
  if (username === DB.admin.username && password === DB.admin.password) {
    return { role: 'admin', id: 'admin' };
  }
  const inter = DB.intermediaries.find(i => i.username === username && i.password === password);
  if (inter) return { role: 'intermediary', id: inter.id };
  const sub = DB.subscribers.find(s => s.username === username && s.password === password);
  if (sub) return { role: 'subscriber', id: sub.id };
  return null;
}

$('#login-form').addEventListener('submit', e => {
  e.preventDefault();
  const u = $('#login-username').value;
  const p = $('#login-password').value;
  const sess = tryLogin(u, p);
  const err = $('#login-error');
  if (!sess) { err.textContent = 'اسم المستخدم أو كلمة السر غير صحيحة'; err.classList.remove('hidden'); return; }
  err.classList.add('hidden');
  setSession(sess);
  $('#login-form').reset();
  boot();
});

$('#logout-btn').addEventListener('click', () => { clearSession(); boot(); });

/* ---------- الإقلاع ---------- */
function boot() {
  const sess = getSession();
  if (!sess) {
    $('#login-view').classList.remove('hidden');
    $('#app-view').classList.add('hidden');
    return;
  }
  $('#login-view').classList.add('hidden');
  $('#app-view').classList.remove('hidden');
  renderApp(sess);
}

function renderApp(sess) {
  const tabsEl = $('#tabs');
  const whoEl = $('#who');
  tabsEl.innerHTML = '';

  if (sess.role === 'admin') {
    whoEl.textContent = '👑 أدمن 1 (رئيسي)';
    buildTabs([
      { key: 'subs', label: 'المشتركين', render: renderAdminSubs },
      { key: 'inter', label: 'الأدمنية الفرعيين', render: renderAdminInter },
      { key: 'providers', label: 'الموردين', render: renderProviders },
      { key: 'settings', label: 'الإعدادات', render: () => renderSettings(sess) },
    ]);
  } else if (sess.role === 'intermediary') {
    const me = DB.intermediaries.find(i => i.id === sess.id);
    if (!me) { clearSession(); return boot(); }
    whoEl.textContent = '🤝 أدمن ' + me.num + (me.name ? ' (' + me.name + ')' : '');
    buildTabs([
      { key: 'mysubs', label: 'مشتركيني', render: () => renderInterSubs(me) },
      { key: 'settings', label: 'الإعدادات', render: () => renderSettings(sess) },
    ]);
  } else {
    const me = DB.subscribers.find(s => s.id === sess.id);
    if (!me) { clearSession(); return boot(); }
    whoEl.textContent = '👤 ' + me.name;
    buildTabs([
      { key: 'profile', label: 'صفحتي', render: () => renderSubscriberProfile(me) },
      { key: 'settings', label: 'الإعدادات', render: () => renderSettings(sess) },
    ]);
  }
}

function buildTabs(tabs) {
  const tabsEl = $('#tabs');
  tabsEl.innerHTML = '';
  tabs.forEach((t, i) => {
    const b = document.createElement('button');
    b.className = 'tab' + (i === 0 ? ' active' : '');
    b.textContent = t.label;
    b.addEventListener('click', () => {
      [...tabsEl.children].forEach(c => c.classList.remove('active'));
      b.classList.add('active');
      t.render();
    });
    tabsEl.appendChild(b);
  });
  tabs[0].render();
}

/* ---------- تبويب الأدمن: المشتركين ---------- */
let adminFilter = { billDate: '', source: '', paid: '', provider: '', q: '' };

function interName(id) {
  const i = DB.intermediaries.find(x => x.id === id);
  return i ? i.name : '—';
}
// تسمية الأدمن الفرعي: "أدمن 2 (الاسم)"
function adminLabel(id) {
  const i = DB.intermediaries.find(x => x.id === id);
  if (!i) return '—';
  return 'أدمن ' + i.num + (i.name ? ' (' + i.name + ')' : '');
}
function nextInterNum() {
  let n = 2;
  DB.intermediaries.forEach(i => { if (i.num >= n) n = i.num + 1; });
  return n;
}
function providerName(id) {
  const p = DB.providers.find(x => x.id === id);
  return p ? p.name : '—';
}

function filteredSubs() {
  return DB.subscribers.filter(s => {
    if (adminFilter.billDate && String(s.billDate) !== adminFilter.billDate) return false;
    if (adminFilter.source === 'direct' && s.intermediaryId) return false;
    if (adminFilter.source && adminFilter.source !== 'direct' && s.intermediaryId !== adminFilter.source) return false;
    if (adminFilter.paid === 'paid' && !s.paid) return false;
    if (adminFilter.paid === 'unpaid' && s.paid) return false;
    if (adminFilter.provider === 'none' && s.providerId) return false;
    if (adminFilter.provider && adminFilter.provider !== 'none' && s.providerId !== adminFilter.provider) return false;
    if (adminFilter.q) {
      const q = adminFilter.q.toLowerCase();
      if (!(s.name.toLowerCase().includes(q) || (s.phone || '').includes(q))) return false;
    }
    return true;
  });
}

function renderAdminSubs() {
  if (applyBillingResets()) saveData();
  const all = DB.subscribers;
  const totalDue = all.filter(s => !s.paid).reduce((a, s) => a + Number(s.amountDue || 0), 0);
  const totalPaid = all.filter(s => s.paid).reduce((a, s) => a + Number(s.amountDue || 0), 0);
  const totalCost = all.reduce((a, s) => a + Number(s.providerCost || 0), 0);

  const list = filteredSubs();
  const interOpts = DB.intermediaries.map(i => `<option value="${i.id}">${esc(i.name)}</option>`).join('');
  const anyFilter = !!(adminFilter.q || adminFilter.billDate || adminFilter.source || adminFilter.paid || adminFilter.provider);

  $('#content').innerHTML = `
    <div class="cards">
      <div class="stat stat-red"><div class="stat-ico">👥</div><div class="stat-body"><div class="label">إجمالي المشتركين</div><div class="value red">${all.length}</div></div></div>
      <div class="stat stat-warn"><div class="stat-ico">⏳</div><div class="stat-body"><div class="label">مطلوب تحصيله</div><div class="value warn">${money(totalDue)}</div></div></div>
      <div class="stat stat-ok"><div class="stat-ico">✅</div><div class="stat-body"><div class="label">تم تحصيله</div><div class="value ok">${money(totalPaid)}</div></div></div>
      <div class="stat stat-ink"><div class="stat-ico">📦</div><div class="stat-body"><div class="label">مطلوب للموردين</div><div class="value">${money(totalCost)}</div></div></div>
    </div>

    <div class="section-head">
      <h2>كل المشتركين</h2>
      <div class="row-actions">
        <button class="btn btn-light btn-sm" id="reset-all" title="ترجيع حالة الدفع لكل المشتركين إلى مطلوب">↺ تصفير الدفعات</button>
        <button class="btn btn-primary" id="add-sub">+ إضافة مشترك</button>
      </div>
    </div>

    <div class="toolbar">
      <div class="search-field">
        <span class="search-ico">🔍</span>
        <input id="f-q" placeholder="بحث بالاسم أو الرقم" value="${esc(adminFilter.q)}" />
        ${adminFilter.q ? '<button class="clear-q" id="f-q-clear" title="مسح البحث">✕</button>' : ''}
      </div>
      <div class="toolbar-filters">
        <select id="f-date" aria-label="موعد الفاتورة">
          <option value="">📅 كل المواعيد</option>
          ${BILL_DAYS.map(d => `<option value="${d}" ${adminFilter.billDate == d ? 'selected' : ''}>يوم ${d}</option>`).join('')}
        </select>
        <select id="f-source" aria-label="المصدر">
          <option value="">👥 كل المصادر</option>
          <option value="direct" ${adminFilter.source === 'direct' ? 'selected' : ''}>تعامل مباشر</option>
          ${DB.intermediaries.map(i => `<option value="${i.id}" ${adminFilter.source === i.id ? 'selected' : ''}>أدمن ${i.num}${i.name ? ' (' + esc(i.name) + ')' : ''}</option>`).join('')}
        </select>
        <select id="f-prov" aria-label="المورّد">
          <option value="">🏭 كل الموردين</option>
          ${DB.providers.map(p => `<option value="${p.id}" ${adminFilter.provider === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
          <option value="none" ${adminFilter.provider === 'none' ? 'selected' : ''}>— بدون مورّد —</option>
        </select>
        <select id="f-paid" aria-label="حالة الدفع">
          <option value="">💳 كل الحالات</option>
          <option value="unpaid" ${adminFilter.paid === 'unpaid' ? 'selected' : ''}>لم يدفع</option>
          <option value="paid" ${adminFilter.paid === 'paid' ? 'selected' : ''}>تم الدفع</option>
        </select>
        ${anyFilter ? '<button class="btn btn-light btn-sm" id="f-clear">✕ مسح الفلاتر</button>' : ''}
      </div>
    </div>

    <div class="result-bar">عدد النتائج: <b id="result-count">${list.length}</b> من ${all.length}</div>

    ${list.length ? subsCards(list, true) : '<div class="empty">لا يوجد مشتركين مطابقين</div>'}
  `;

  $('#add-sub').addEventListener('click', () => openSubForm(null, null, interOpts));
  $('#reset-all').addEventListener('click', resetAllPayments);
  $('#f-q').addEventListener('input', e => { adminFilter.q = e.target.value; refreshAdminTable(); });
  $('#f-date').addEventListener('change', e => { adminFilter.billDate = e.target.value; renderAdminSubs(); });
  $('#f-source').addEventListener('change', e => { adminFilter.source = e.target.value; renderAdminSubs(); });
  $('#f-prov').addEventListener('change', e => { adminFilter.provider = e.target.value; renderAdminSubs(); });
  $('#f-paid').addEventListener('change', e => { adminFilter.paid = e.target.value; renderAdminSubs(); });
  const qClear = $('#f-q-clear');
  if (qClear) qClear.addEventListener('click', () => { adminFilter.q = ''; renderAdminSubs(); });
  const clearBtn = $('#f-clear');
  if (clearBtn) clearBtn.addEventListener('click', () => { adminFilter = { billDate: '', source: '', paid: '', provider: '', q: '' }; renderAdminSubs(); });
  bindSubRowActions(true, interOpts);
}

function resetAllPayments() {
  if (!confirm('هترجّع حالة الدفع لكل المشتركين إلى "مطلوب". متأكد؟')) return;
  DB.subscribers.forEach(s => { s.paid = false; s.paymentClaimed = false; delete s.paidCycle; delete s.claimCycle; });
  saveData(); toast('تم تصفير كل الدفعات'); rerenderCurrent();
}

function refreshAdminTable() {
  const list = filteredSubs();
  const holder = $('#subs-list-holder');
  if (holder) holder.innerHTML = list.length ? subsCards(list, true, true) : '<div class="empty">لا يوجد مشتركين مطابقين</div>';
  const rc = $('#result-count'); if (rc) rc.textContent = list.length;
  const interOpts = DB.intermediaries.map(i => `<option value="${i.id}">${esc(i.name)}</option>`).join('');
  bindSubRowActions(true, interOpts);
}

// كارت مشترك: مقفول يبان الاسم + الرقم + معاد الفاتورة + الحالة، و"المزيد" يفتح الباقي
function subCardHTML(s, isAdmin) {
  const statusChip = s.paid
    ? '<span class="chip paid">تم الدفع</span>'
    : (s.paymentClaimed ? '<span class="chip review">قيد المراجعة</span>' : '<span class="chip unpaid">مطلوب</span>');
  const iObj = s.intermediaryId ? DB.intermediaries.find(x => x.id === s.intermediaryId) : null;
  const src = iObj ? `<span class="chip via">أدمن ${iObj.num}${iObj.name ? ' (' + esc(iObj.name) + ')' : ''}</span>` : `<span class="chip direct">مباشر</span>`;
  const prov = s.providerId ? `<span class="chip prov">${esc(providerName(s.providerId))}</span>` : '<span class="muted">—</span>';

  const details = `<div class="sub-details">
      <div class="prow"><span class="k">الباقة</span><span class="v"><span class="chip gb">${esc(s.gb)} جيجا</span></span></div>
      <div class="prow"><span class="k">المبلغ المطلوب</span><span class="v"><b class="due-v">${money(s.amountDue)}</b></span></div>
      ${isAdmin && s.activeMonth ? `<div class="prow"><span class="k">الشهر الشغال</span><span class="v"><span class="chip gb">${esc(monthLabel(s.activeMonth))}</span></span></div>` : ''}
      ${isAdmin ? `<div class="prow"><span class="k">المصدر</span><span class="v">${src}</span></div>` : ''}
      ${isAdmin ? `<div class="prow"><span class="k">المورّد</span><span class="v">${prov}</span></div>` : ''}
      ${isAdmin ? `<div class="prow"><span class="k">تكلفة المورّد</span><span class="v">${s.providerCost ? money(s.providerCost) : '<span class="muted">—</span>'}</span></div>` : ''}
      ${s.notes ? `<div class="prow"><span class="k">ملاحظات</span><span class="v">${esc(s.notes)}</span></div>` : ''}
      <div class="sub-actions">
        <button class="btn btn-sm ${s.paid ? 'btn-light' : 'btn-ok'}" data-act="toggle">${s.paid ? 'إلغاء الدفع' : '✓ تم الدفع'}</button>
        <button class="btn btn-sm btn-light" data-act="edit">تعديل</button>
        <button class="btn btn-sm btn-danger" data-act="del">حذف</button>
      </div>
    </div>`;

  return `<div class="sub-card" data-id="${s.id}">
    <div class="sub-head">
      <div class="sub-ident">
        <div class="sub-avatar">${esc((s.name || '؟').charAt(0))}</div>
        <div class="sub-id-txt">
          <div class="sub-name">${esc(s.name)}</div>
          <div class="sub-phone">${phoneWithWa(s.phone)}</div>
        </div>
      </div>
      <div class="sub-head-meta">
        <span class="chip date">يوم ${esc(s.billDate)}</span>
        ${statusChip}
      </div>
    </div>
    <button class="more-btn" data-act="more" aria-expanded="false">المزيد <span class="more-caret">▾</span></button>
    ${details}
  </div>`;
}

function subsCards(list, isAdmin, inner) {
  const cards = `<div class="subs-list">${list.map(s => subCardHTML(s, isAdmin)).join('')}</div>`;
  return inner ? cards : `<div id="subs-list-holder">${cards}</div>`;
}

function bindSubRowActions(isAdmin, interOpts) {
  document.querySelectorAll('#subs-list-holder .sub-card').forEach(card => {
    const id = card.getAttribute('data-id');
    card.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', () => {
        const act = btn.getAttribute('data-act');
        if (act === 'more') {
          const open = card.classList.toggle('open');
          btn.setAttribute('aria-expanded', open ? 'true' : 'false');
          btn.innerHTML = open ? 'أقل <span class="more-caret">▴</span>' : 'المزيد <span class="more-caret">▾</span>';
          return;
        }
        const sub = DB.subscribers.find(s => s.id === id);
        if (!sub) return;
        if (act === 'toggle') {
          sub.paid = !sub.paid;
          if (sub.paid) { sub.paymentClaimed = false; sub.paidCycle = activeCycleKey(sub.billDate); delete sub.claimCycle; }
          else { delete sub.paidCycle; }
          saveData(); toast(sub.paid ? 'تم تسجيل الدفع' : 'تم الإلغاء'); rerenderCurrent();
        }
        else if (act === 'edit') openSubForm(sub, sub.intermediaryId || null, interOpts);
        else if (act === 'del') {
          if (confirm('تأكيد حذف ' + sub.name + '؟')) {
            DB.subscribers = DB.subscribers.filter(s => s.id !== id);
            saveData(); toast('تم الحذف'); rerenderCurrent();
          }
        }
      });
    });
  });
}

function rerenderCurrent() {
  const active = $('#tabs .tab.active');
  if (active) active.click();
}

/* ---------- نموذج إضافة/تعديل مشترك ---------- */
function openSubForm(sub, lockInterId, interOpts) {
  const isEdit = !!sub;
  const s = sub || { name: '', phone: '', gb: '', billDate: BILL_DAYS[0], amountDue: '', paid: false, intermediaryId: lockInterId, providerId: '', providerCost: '', startMonth: '', activeMonth: '', username: '', password: '', notes: '' };
  const lockInter = lockInterId !== null && lockInterId !== undefined && getSession().role === 'intermediary';

  let sourceField = '';
  if (getSession().role === 'admin') {
    sourceField = `<div class="field">
      <label>المصدر</label>
      <select id="s-inter">
        <option value="">تعامل مباشر (أنا)</option>
        ${DB.intermediaries.map(i => `<option value="${i.id}" ${s.intermediaryId === i.id ? 'selected' : ''}>أدمن ${i.num}${i.name ? ' (' + esc(i.name) + ')' : ''}</option>`).join('')}
      </select>
    </div>
    <div class="two-col">
      <div class="field"><label>المورّد (اللي بيفعّل الخط)</label>
        <select id="s-prov">
          <option value="">— بدون —</option>
          ${DB.providers.map(p => `<option value="${p.id}" ${s.providerId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>تكلفة الخط عند المورّد (ج.م)</label><input id="s-cost" type="number" value="${esc(s.providerCost)}" placeholder="اللي هتبعته للمورّد" /></div>
    </div>`;
  }

  openModal(isEdit ? 'تعديل مشترك' : 'إضافة مشترك', `
    <div class="two-col">
      <div class="field"><label>الاسم</label><input id="s-name" value="${esc(s.name)}" placeholder="اسم المشترك" /></div>
      <div class="field"><label>رقم الموبايل</label><input id="s-phone" value="${esc(s.phone)}" placeholder="01xxxxxxxxx" /></div>
    </div>
    <div class="two-col">
      <div class="field"><label>الباقة (جيجا)</label><input id="s-gb" type="number" value="${esc(s.gb)}" placeholder="مثال: 40" /></div>
      <div class="field"><label>يوم الفاتورة</label>
        <select id="s-date">${BILL_DAYS.map(d => `<option value="${d}" ${s.billDate == d ? 'selected' : ''}>يوم ${d}</option>`).join('')}</select>
      </div>
    </div>
    <div class="field"><label>المبلغ المطلوب (ج.م)</label><input id="s-due" type="number" value="${esc(s.amountDue)}" placeholder="مثال: 150" /></div>
    <div class="two-col">
      <div class="field"><label>شهر الاشتراك</label><input id="s-start" type="month" value="${esc(s.startMonth)}" />
        <div class="hint">الشهر اللي اشترك فيه</div></div>
      <div class="field"><label>الشهر الشغال حاليًا</label><input id="s-active" type="month" value="${esc(s.activeMonth)}" />
        <div class="hint">الشهر اللي شغال دلوقتي</div></div>
    </div>
    ${sourceField}
    <div class="two-col">
      <div class="field"><label>اسم مستخدم للدخول</label><input id="s-user" value="${esc(s.username)}" placeholder="اسم مستخدم المشترك" />
        <div class="hint">يستخدمه المشترك لرؤية صفحته</div></div>
      <div class="field"><label>كلمة السر</label><input id="s-pass" value="${esc(s.password)}" placeholder="كلمة سر" /></div>
    </div>
    <div class="field"><label>ملاحظات</label><textarea id="s-notes" rows="2" placeholder="اختياري">${esc(s.notes)}</textarea></div>
    <div class="modal-actions">
      <button class="btn btn-primary" id="s-save">حفظ</button>
      <button class="btn btn-light" id="s-cancel">إلغاء</button>
    </div>
  `);

  $('#s-cancel').addEventListener('click', closeModal);
  $('#s-save').addEventListener('click', () => {
    const name = $('#s-name').value.trim();
    const phone = $('#s-phone').value.trim();
    const gb = $('#s-gb').value.trim();
    const billDate = $('#s-date').value;
    const amountDue = $('#s-due').value.trim();
    const username = $('#s-user').value.trim();
    const password = $('#s-pass').value.trim();
    const notes = $('#s-notes').value.trim();
    let intermediaryId = lockInter ? lockInterId : (getSession().role === 'admin' ? ($('#s-inter').value || null) : lockInterId || null);
    const isAdminRole = getSession().role === 'admin';
    const providerId = isAdminRole ? ($('#s-prov').value || '') : (sub ? sub.providerId || '' : '');
    const providerCost = isAdminRole ? ($('#s-cost').value.trim()) : (sub ? sub.providerCost || '' : '');
    const startMonth = $('#s-start').value;
    const activeMonth = $('#s-active').value;

    if (!name) return toast('اكتب اسم المشترك');
    if (!phone) return toast('اكتب رقم الموبايل');
    if (username) {
      const clash = DB.subscribers.find(x => x.username === username && x.id !== (sub ? sub.id : null)) ||
                    DB.intermediaries.find(x => x.username === username) ||
                    (username === DB.admin.username);
      if (clash) return toast('اسم المستخدم مستخدم بالفعل');
    }

    if (isEdit) {
      Object.assign(sub, { name, phone, gb, billDate, amountDue, username, password, notes, intermediaryId, providerId, providerCost, startMonth, activeMonth });
    } else {
      DB.subscribers.push({ id: uid(), name, phone, gb, billDate, amountDue, paid: false, intermediaryId, providerId, providerCost, startMonth, activeMonth, username, password, notes, createdAt: Date.now() });
    }
    saveData();
    closeModal();
    toast(isEdit ? 'تم التعديل' : 'تمت الإضافة');
    rerenderCurrent();
  });
}

/* ---------- تبويب الأدمن: الوسطاء ---------- */
function renderAdminInter() {
  const rows = DB.intermediaries.map(i => {
    const subs = DB.subscribers.filter(s => s.intermediaryId === i.id);
    const due = subs.filter(s => !s.paid).reduce((a, s) => a + Number(s.amountDue || 0), 0);
    return `<tr data-id="${i.id}">
      <td data-label="الرتبة"><b>أدمن ${i.num}</b></td>
      <td data-label="الاسم">${esc(i.name || '—')}</td>
      <td data-label="مستخدم">${esc(i.username)}</td>
      <td data-label="كلمة السر">${esc(i.password)}</td>
      <td data-label="عدد المشتركين">${subs.length}</td>
      <td data-label="مطلوب منه"><b>${money(due)}</b></td>
      <td data-label="إجراءات"><div class="row-actions">
        <button class="btn btn-sm btn-light" data-act="edit">تعديل</button>
        <button class="btn btn-sm btn-danger" data-act="del">حذف</button>
      </div></td>
    </tr>`;
  }).join('');

  $('#content').innerHTML = `
    <div class="section-head">
      <h2>الأدمنية الفرعيين</h2>
      <button class="btn btn-primary" id="add-inter">+ إضافة أدمن فرعي</button>
    </div>
    <p class="muted" style="margin-top:-.4rem">دول الأشخاص اللي بتتعامل من خلالهم (أدمن 2، أدمن 3 ...). كل واحد بيدخل ويشوف مشتركينه بس.</p>
    ${DB.intermediaries.length ? `<div class="table-wrapper"><table>
      <thead><tr><th>الرتبة</th><th>الاسم</th><th>مستخدم</th><th>كلمة السر</th><th>عدد المشتركين</th><th>مطلوب منه</th><th>إجراءات</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`
      : '<div class="empty">لا يوجد أدمنية فرعيين بعد. أضف واحد عشان يسجّل مشتركينه.</div>'}
  `;

  $('#add-inter').addEventListener('click', () => openInterForm(null));
  document.querySelectorAll('#content tr[data-id]').forEach(tr => {
    const id = tr.getAttribute('data-id');
    tr.querySelector('[data-act="edit"]').addEventListener('click', () => openInterForm(DB.intermediaries.find(i => i.id === id)));
    tr.querySelector('[data-act="del"]').addEventListener('click', () => {
      const inter = DB.intermediaries.find(i => i.id === id);
      const count = DB.subscribers.filter(s => s.intermediaryId === id).length;
      if (confirm(`حذف أدمن ${inter.num}؟${count ? ' سيتحول ' + count + ' مشترك إلى تعامل مباشر.' : ''}`)) {
        DB.subscribers.forEach(s => { if (s.intermediaryId === id) s.intermediaryId = null; });
        DB.intermediaries = DB.intermediaries.filter(i => i.id !== id);
        saveData(); toast('تم الحذف'); renderAdminInter();
      }
    });
  });
}

function openInterForm(inter) {
  const isEdit = !!inter;
  const num = isEdit ? inter.num : nextInterNum();
  const i = inter || { name: '', username: 'admin' + num, password: '', whatsapp: '', instapay: '', vfcash: '' };
  openModal(isEdit ? ('تعديل أدمن ' + num) : ('إضافة أدمن ' + num), `
    <div class="field"><label>الاسم (اختياري)</label><input id="i-name" value="${esc(i.name)}" placeholder="اسم الشخص" /></div>
    <div class="two-col">
      <div class="field"><label>رقم واتساب</label><input id="i-wa" value="${esc(i.whatsapp || '')}" placeholder="01xxxxxxxxx" />
        <div class="hint">لاستقبال إثبات الدفع</div></div>
      <div class="field"><label>رقم فودافون كاش</label><input id="i-vf" value="${esc(i.vfcash || '')}" placeholder="01xxxxxxxxx" />
        <div class="hint">المشترك يحوّل عليه</div></div>
    </div>
    <div class="field"><label>حساب إنستا باي (InstaPay)</label><input id="i-ip" value="${esc(i.instapay || '')}" placeholder="name@instapay أو الرقم" /></div>
    <div class="two-col">
      <div class="field"><label>اسم المستخدم</label><input id="i-user" value="${esc(i.username)}" placeholder="admin${num}" /></div>
      <div class="field"><label>كلمة السر</label><input id="i-pass" value="${esc(i.password)}" placeholder="كلمة السر" /></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" id="i-save">حفظ</button>
      <button class="btn btn-light" id="i-cancel">إلغاء</button>
    </div>
  `);
  $('#i-cancel').addEventListener('click', closeModal);
  $('#i-save').addEventListener('click', () => {
    const name = $('#i-name').value.trim();
    const username = $('#i-user').value.trim();
    const password = $('#i-pass').value.trim();
    const whatsapp = $('#i-wa').value.trim();
    const vfcash = $('#i-vf').value.trim();
    const instapay = $('#i-ip').value.trim();
    if (!username || !password) return toast('اكتب اسم المستخدم وكلمة السر');
    const clash = DB.intermediaries.find(x => x.username === username && x.id !== (inter ? inter.id : null)) ||
                  DB.subscribers.find(x => x.username === username) || username === DB.admin.username;
    if (clash) return toast('اسم المستخدم مستخدم بالفعل');
    if (isEdit) Object.assign(inter, { name, username, password, whatsapp, vfcash, instapay });
    else DB.intermediaries.push({ id: uid(), num, name, username, password, whatsapp, vfcash, instapay });
    saveData(); closeModal(); toast(isEdit ? 'تم التعديل' : 'تمت الإضافة'); renderAdminInter();
  });
}

/* ---------- تبويب الموردين ---------- */
let providerQuery = '';

// رسالة كشف الحساب للمورّد (dayLabel لو الكشف مخصوص فاتورة يوم معيّن)
function providerStatementMsg(p, subs, total, dayLabel) {
  const header = dayLabel
    ? `📋 كشف ${p.name} — فاتورة ${dayLabel}`
    : `📋 كشف حساب — ${p.name}`;
  const lines = subs.map((s, i) =>
    `${i + 1}) ${s.name}${s.phone ? ' (' + s.phone + ')' : ''} — ${s.gb || '?'}ج${dayLabel ? '' : ' — يوم ' + s.billDate} — ${Number(s.providerCost || 0)} ج.م`
  ).join('\n');
  return `${header}\nعدد الخطوط: ${subs.length}\nالإجمالي: ${Number(total || 0)} ج.م\n\n${lines}`;
}

function providerCardHTML(p) {
  const subs = DB.subscribers.filter(s => s.providerId === p.id);
  const total = subs.reduce((a, s) => a + Number(s.providerCost || 0), 0);
  const collected = subs.reduce((a, s) => a + Number(s.amountDue || 0), 0);
  const profit = collected - total; // مكسبك = اللي بتحصّله − اللي بتبعته للمورّد

  // صفوف الفواتير: لكل يوم فاتورة فيه خطوط، زرار ابعت الكشف بتاعه + نسخ
  const billRows = BILL_DAYS.map(d => {
    const daySubs = subs.filter(s => String(s.billDate) === String(d));
    if (!daySubs.length) return '';
    const t = daySubs.reduce((a, s) => a + Number(s.providerCost || 0), 0);
    const dayLabel = 'يوم ' + d;
    const msg = providerStatementMsg(p, daySubs, t, dayLabel);
    const waB = p.whatsapp
      ? `<a class="btn btn-xs btn-wa" href="${waLink(p.whatsapp, msg)}" target="_blank" rel="noopener">📲 ابعت</a>`
      : '';
    const copyB = `<button class="btn btn-xs btn-light copy-btn" data-copy="${esc(msg)}">📋 نسخ</button>`;
    return `<div class="prov-bill-row">
      <span class="chip date">${dayLabel}</span>
      <span class="pb-count">${daySubs.length} خط</span>
      <b class="pb-total">${money(t)}</b>
      <span class="pb-actions">${waB}${copyB}</span>
    </div>`;
  }).filter(Boolean).join('');

  const rows = subs.map(s => `<tr>
    <td data-label="المشترك">${esc(s.name)}</td><td data-label="الرقم">${phoneWithWa(s.phone)}</td>
    <td data-label="الباقة"><span class="chip gb">${esc(s.gb)}ج</span></td>
    <td data-label="الفاتورة"><span class="chip date">يوم ${esc(s.billDate)}</span></td>
    <td data-label="الحالة">${s.paid ? '<span class="chip paid">مدفوع</span>' : '<span class="chip unpaid">مطلوب</span>'}</td>
    <td data-label="التكلفة"><b>${money(s.providerCost)}</b></td>
  </tr>`).join('');

  const fullMsg = providerStatementMsg(p, subs, total);
  const fullWaBtn = (p.whatsapp && subs.length)
    ? `<a class="btn btn-sm btn-wa" href="${waLink(p.whatsapp, fullMsg)}" target="_blank" rel="noopener">📲 الكشف الكامل</a>`
    : '';
  const fullCopyBtn = subs.length
    ? `<button class="btn btn-sm btn-light copy-btn" data-copy="${esc(fullMsg)}">📋 نسخ الكشف</button>`
    : '';
  const provPhone = p.whatsapp ? '<span class="prov-phone">' + phoneWithWa(p.whatsapp) + '</span>' : '';

  return `<div class="prov-card" data-id="${p.id}">
    <div class="prov-head">
      <div class="prov-id">
        <div class="prov-avatar">${esc((p.name || '؟').charAt(0))}</div>
        <div>
          <div class="prov-name">${esc(p.name)}</div>
          <div class="muted" style="font-size:.85rem">${subs.length} خط ${provPhone}</div>
        </div>
      </div>
      <div class="prov-metrics">
        <div class="pm-box send"><span class="muted">بتبعتله</span><b>${money(total)}</b></div>
        <div class="pm-box gain"><span class="muted">مكسبك</span><b>${money(profit)}</b></div>
      </div>
    </div>
    ${billRows ? `<div class="prov-bills">
      <div class="prov-bills-title">📤 ابعت الكشف حسب الفاتورة</div>
      ${billRows}
    </div>` : ''}
    <div class="prov-actions">
      ${fullWaBtn}
      ${fullCopyBtn}
      <button class="btn btn-sm btn-light" data-act="edit">✏️ تعديل</button>
      <button class="btn btn-sm btn-danger" data-act="del">🗑 حذف</button>
    </div>
    ${subs.length ? `<details class="prov-details"><summary>عرض كل الخطوط (${subs.length})</summary>
      <div class="table-wrapper" style="margin-top:.6rem"><table>
        <thead><tr><th>المشترك</th><th>الرقم</th><th>الباقة</th><th>الفاتورة</th><th>الحالة</th><th>التكلفة</th></tr></thead>
        <tbody>${rows}</tbody></table></div></details>`
      : '<div class="muted" style="padding:.5rem 0">لا يوجد خطوط مرتبطة بهذا المورّد بعد.</div>'}
  </div>`;
}

function filteredProviders() {
  const q = providerQuery.trim().toLowerCase();
  return DB.providers.filter(p => !q || (p.name || '').toLowerCase().includes(q));
}

// كارت مكسبك من كل مورّد (بناءً على الفاتورة): بتحصّل − بتبعت = مكسبك، مع تفصيل بأيام الفواتير
function profitCardHTML(grandProfit) {
  const groups = [];
  DB.providers.forEach(p => {
    const subs = DB.subscribers.filter(s => s.providerId === p.id);
    if (subs.length) groups.push({ name: p.name, subs });
  });
  const directSubs = DB.subscribers.filter(s => !s.providerId);
  if (directSubs.length) groups.push({ name: 'تعامل مباشر (بدون مورّد)', subs: directSubs });
  if (!groups.length) return '';

  const rows = groups.map(g => {
    const collected = g.subs.reduce((a, s) => a + Number(s.amountDue || 0), 0);
    const cost = g.subs.reduce((a, s) => a + Number(s.providerCost || 0), 0);
    const profit = collected - cost;
    const dayChips = BILL_DAYS.map(d => {
      const ds = g.subs.filter(s => String(s.billDate) === String(d));
      if (!ds.length) return '';
      const dp = ds.reduce((a, s) => a + Number(s.amountDue || 0) - Number(s.providerCost || 0), 0);
      return `<span class="chip profitday">يوم ${d}: ${money(dp)}</span>`;
    }).filter(Boolean).join(' ');
    return `<div class="profit-row">
      <div class="pr-top">
        <span class="pr-name">${esc(g.name)}</span>
        <span class="pr-profit ${profit >= 0 ? 'pos' : 'neg'}">${money(profit)}</span>
      </div>
      <div class="pr-sub">بتحصّل <b>${money(collected)}</b> − بتبعت <b>${money(cost)}</b></div>
      ${dayChips ? `<div class="pr-days">${dayChips}</div>` : ''}
    </div>`;
  }).join('');

  return `<div class="profit-card">
    <div class="profit-head">
      <div class="profit-title">💰 مكسبك من كل مورّد <span class="muted" style="font-weight:400;font-size:.8rem">(حسب الفاتورة)</span></div>
      <div class="profit-total"><span class="muted">الإجمالي المتوقع</span><b class="${grandProfit >= 0 ? 'pos' : 'neg'}">${money(grandProfit)}</b></div>
    </div>
    <div class="profit-list">${rows}</div>
  </div>`;
}

function renderProviders() {
  if (applyBillingResets()) saveData();
  const grand = DB.subscribers.reduce((a, s) => a + Number(s.providerCost || 0), 0);
  const totalProfit = DB.subscribers.reduce((a, s) => a + Number(s.amountDue || 0) - Number(s.providerCost || 0), 0);
  const unassigned = DB.subscribers.filter(s => Number(s.providerCost || 0) > 0 && !s.providerId);
  const list = filteredProviders();

  $('#content').innerHTML = `
    <div class="cards">
      <div class="stat stat-red"><div class="stat-ico">🏭</div><div class="stat-body"><div class="label">عدد الموردين</div><div class="value red">${DB.providers.length}</div></div></div>
      <div class="stat stat-warn"><div class="stat-ico">💸</div><div class="stat-body"><div class="label">إجمالي المطلوب للموردين</div><div class="value warn">${money(grand)}</div></div></div>
      <div class="stat stat-ok"><div class="stat-ico">💰</div><div class="stat-body"><div class="label">مكسبك المتوقع</div><div class="value ok">${money(totalProfit)}</div></div></div>
    </div>
    ${profitCardHTML(totalProfit)}
    <div class="section-head">
      <h2>الموردين (اللي بيفعّلوا الباقات)</h2>
      <button class="btn btn-primary" id="add-prov">+ إضافة مورّد</button>
    </div>
    <p class="muted" style="margin-top:-.4rem">اربط كل مشترك بمورّده وحدد تكلفة الخط من صفحة المشترك، وهنا يتجمّع حساب كل مورّد عشان تعرف تبعتله كام.</p>
    ${unassigned.length ? `<div class="warn-box">⚠️ فيه ${unassigned.length} خط عليهم تكلفة بدون مورّد محدد. افتح المشترك وحدد مورّده.</div>` : ''}
    ${DB.providers.length ? `<div class="toolbar"><div class="search-field"><span class="search-ico">🔍</span><input id="prov-q" placeholder="بحث باسم المورّد" value="${esc(providerQuery)}" />${providerQuery ? '<button class="clear-q" id="prov-q-clear" title="مسح البحث">✕</button>' : ''}</div></div>` : ''}
    <div id="prov-cards">
      ${DB.providers.length ? (list.length ? list.map(providerCardHTML).join('') : '<div class="empty">لا يوجد مورّد بهذا الاسم</div>') : '<div class="empty">لا يوجد موردين بعد. أضف مورّد وابدأ تربط الخطوط بيه.</div>'}
    </div>
  `;

  $('#add-prov').addEventListener('click', () => openProviderForm(null));
  const provQ = $('#prov-q');
  if (provQ) provQ.addEventListener('input', e => { providerQuery = e.target.value; refreshProviderCards(); });
  const provQClear = $('#prov-q-clear');
  if (provQClear) provQClear.addEventListener('click', () => { providerQuery = ''; renderProviders(); });
  bindProviderCards();
}

function refreshProviderCards() {
  const holder = $('#prov-cards');
  if (!holder) return;
  const list = filteredProviders();
  holder.innerHTML = DB.providers.length
    ? (list.length ? list.map(providerCardHTML).join('') : '<div class="empty">لا يوجد مورّد بهذا الاسم</div>')
    : '<div class="empty">لا يوجد موردين بعد. أضف مورّد وابدأ تربط الخطوط بيه.</div>';
  bindProviderCards();
}

function bindProviderCards() {
  document.querySelectorAll('#prov-cards .prov-card').forEach(card => {
    const id = card.getAttribute('data-id');
    card.querySelector('[data-act="edit"]').addEventListener('click', () => openProviderForm(DB.providers.find(p => p.id === id)));
    card.querySelector('[data-act="del"]').addEventListener('click', () => {
      const p = DB.providers.find(x => x.id === id);
      const count = DB.subscribers.filter(s => s.providerId === id).length;
      if (confirm(`حذف المورّد ${p.name}؟${count ? ' سيتم فك ارتباط ' + count + ' خط.' : ''}`)) {
        DB.subscribers.forEach(s => { if (s.providerId === id) s.providerId = ''; });
        DB.providers = DB.providers.filter(x => x.id !== id);
        saveData(); toast('تم الحذف'); renderProviders();
      }
    });
  });
  document.querySelectorAll('#prov-cards .copy-btn').forEach(b =>
    b.addEventListener('click', () => copyToClipboard(b.getAttribute('data-copy'))));
}

function openProviderForm(prov) {
  const isEdit = !!prov;
  const p = prov || { name: '', whatsapp: '', notes: '' };
  openModal(isEdit ? 'تعديل مورّد' : 'إضافة مورّد', `
    <div class="field"><label>اسم المورّد</label><input id="p-name" value="${esc(p.name)}" placeholder="اسم الشخص اللي بيفعّل" /></div>
    <div class="field"><label>رقم واتساب المورّد (اختياري)</label><input id="p-wa" value="${esc(p.whatsapp || '')}" placeholder="01xxxxxxxxx" /></div>
    <div class="field"><label>ملاحظات</label><textarea id="p-notes" rows="2" placeholder="اختياري">${esc(p.notes || '')}</textarea></div>
    <div class="modal-actions">
      <button class="btn btn-primary" id="p-save">حفظ</button>
      <button class="btn btn-light" id="p-cancel">إلغاء</button>
    </div>
  `);
  $('#p-cancel').addEventListener('click', closeModal);
  $('#p-save').addEventListener('click', () => {
    const name = $('#p-name').value.trim();
    const whatsapp = $('#p-wa').value.trim();
    const notes = $('#p-notes').value.trim();
    if (!name) return toast('اكتب اسم المورّد');
    if (isEdit) Object.assign(prov, { name, whatsapp, notes });
    else DB.providers.push({ id: uid(), name, whatsapp, notes });
    saveData(); closeModal(); toast(isEdit ? 'تم التعديل' : 'تمت الإضافة'); renderProviders();
  });
}

/* ---------- تبويب الأدمن الفرعي ---------- */
function renderInterSubs(me) {
  if (applyBillingResets()) saveData();
  const subs = DB.subscribers.filter(s => s.intermediaryId === me.id);
  const due = subs.filter(s => !s.paid).reduce((a, s) => a + Number(s.amountDue || 0), 0);
  const paid = subs.filter(s => s.paid).reduce((a, s) => a + Number(s.amountDue || 0), 0);

  $('#content').innerHTML = `
    <div class="cards">
      <div class="stat stat-red"><div class="stat-ico">👥</div><div class="stat-body"><div class="label">مشتركيني</div><div class="value red">${subs.length}</div></div></div>
      <div class="stat stat-warn"><div class="stat-ico">⏳</div><div class="stat-body"><div class="label">مطلوب تحصيله</div><div class="value warn">${money(due)}</div></div></div>
      <div class="stat stat-ok"><div class="stat-ico">✅</div><div class="stat-body"><div class="label">تم تحصيله</div><div class="value ok">${money(paid)}</div></div></div>
    </div>
    <div class="section-head">
      <h2>المشتركين اللي سجّلتهم</h2>
      <button class="btn btn-primary" id="add-sub">+ إضافة مشترك</button>
    </div>
    ${subs.length ? subsCards(subs, false) : '<div class="empty">لسه مسجّلتش مشتركين. اضغط إضافة مشترك.</div>'}
  `;
  $('#add-sub').addEventListener('click', () => openSubForm(null, me.id, ''));
  bindSubRowActions(false, '');
}

/* ---------- صفحة المشترك ---------- */
function renderSubscriberProfile(me) {
  if (applyBillingResets()) saveData();
  const nb = nextBillInfo(Number(me.billDate));
  const reset = nextResetDate(Number(me.billDate));
  const resetStr = reset.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' });
  // الشخص المسؤول عن التحصيل: وسيط لو موجود، وإلا الأدمن
  const inter = me.intermediaryId ? DB.intermediaries.find(i => i.id === me.intermediaryId) : null;
  const contactName = inter ? ('أدمن ' + inter.num + (inter.name ? ' (' + inter.name + ')' : '')) : 'الأدمن';
  const contactNumber = inter ? (inter.whatsapp || '') : (DB.admin.whatsapp || '');
  const contactVf = inter ? (inter.vfcash || '') : (DB.admin.vfcash || '');
  const contactIp = inter ? (inter.instapay || '') : (DB.admin.instapay || '');
  const src = inter ? ('عن طريق أدمن ' + inter.num + (inter.name ? ' (' + inter.name + ')' : '')) : 'تعامل مباشر';
  const dateStr = nb.date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' });

  const statusChip = me.paid
    ? '<span class="chip paid">تم الدفع</span>'
    : (me.paymentClaimed ? '<span class="chip review">قيد المراجعة</span>' : '<span class="chip unpaid">مطلوب</span>');

  // منطقة تأكيد الدفع (تظهر فقط لو لسه ما دفعش)
  let payBox = '';
  if (!me.paid) {
    const msg = `السلام عليكم، أنا ${me.name} (رقم ${me.phone || ''}).\nحابب أأكد دفع فاتورة الباقة (${me.gb} جيجا) المطلوب: ${me.amountDue} ج.م.\nمرفق صورة إثبات الدفع 👇`;
    const link = waLink(contactNumber, msg);
    payBox = `
      <div class="pay-box">
        <div class="pay-title">تأكيد الدفع</div>
        <p class="muted" style="margin:.2rem 0 .8rem">ابعت صورة (اسكرين) إثبات الدفع لـ <b>${esc(contactName)}</b> على واتساب، وبعد المراجعة هتظهر حالتك "تم الدفع".</p>
        ${contactNumber
          ? `<a class="btn btn-wa btn-block" id="wa-btn" href="${link}" target="_blank" rel="noopener">📲 أكّد الدفع على واتساب (${esc(contactName)})</a>`
          : `<div class="empty" style="padding:1rem">لم يتم إضافة رقم واتساب لـ ${esc(contactName)} بعد. تواصل معه مباشرة.</div>`}
        ${me.paymentClaimed ? '<p class="muted" style="text-align:center;margin-top:.6rem">✅ تم إرسال طلبك — في انتظار التأكيد.</p>' : ''}
      </div>`;
  }

  // صندوق طرق الدفع مع المسؤول
  const payRows = [
    contactVf ? `<div class="pay-item vf"><span class="pm-label">📱 فودافون كاش</span><span class="pm-val">${esc(contactVf)}</span><button class="copy-btn" data-copy="${esc(contactVf)}">نسخ</button></div>` : '',
    contactIp ? `<div class="pay-item ip"><span class="pm-label">🏦 إنستا باي</span><span class="pm-val">${esc(contactIp)}</span><button class="copy-btn" data-copy="${esc(contactIp)}">نسخ</button></div>` : '',
  ].filter(Boolean).join('');
  const contactBox = payRows ? `
    <div class="pay-box">
      <div class="pay-title">طرق الدفع — ${esc(contactName)}</div>
      <p class="muted" style="margin:.2rem 0 .7rem">حوّل المبلغ على أي وسيلة منهم 👇</p>
      <div class="pay-methods">${payRows}</div>
    </div>` : '';

  const monthRows = `
          ${me.startMonth ? `<div class="prow"><span class="k">شهر الاشتراك</span><span class="v">${esc(monthLabel(me.startMonth))}</span></div>` : ''}
          ${me.activeMonth ? `<div class="prow"><span class="k">الشهر الشغال</span><span class="v"><span class="chip gb">${esc(monthLabel(me.activeMonth))}</span></span></div>` : ''}`;

  $('#content').innerHTML = `
    <div class="profile">
      <div class="profile-card">
        <div class="profile-top">
          <div class="avatar">${esc((me.name || '؟').charAt(0))}</div>
          <h2>${esc(me.name)}</h2>
          <div>${esc(me.phone || '')}</div>
        </div>
        <div class="profile-rows">
          <div class="prow"><span class="k">الباقة</span><span class="v">${esc(me.gb)} جيجا</span></div>
          <div class="prow"><span class="k">يوم الفاتورة</span><span class="v"><span class="chip date">يوم ${esc(me.billDate)}</span></span></div>
          <div class="prow"><span class="k">الفاتورة القادمة</span><span class="v">${dateStr} (بعد ${nb.days} يوم)</span></div>
          <div class="prow"><span class="k">يفتح الدفع للشهر الجديد</span><span class="v">${resetStr} <span class="muted" style="font-weight:400;font-size:.8rem">(قبلها بـ${RESET_LEAD_DAYS} أيام)</span></span></div>
          ${monthRows}
          <div class="prow"><span class="k">حالة الدفع</span><span class="v">${statusChip}</span></div>
          ${me.notes ? `<div class="prow"><span class="k">ملاحظات</span><span class="v">${esc(me.notes)}</span></div>` : ''}
          <div class="prow"><span class="k">المبلغ المطلوب</span><span class="big-due">${money(me.amountDue)}</span></div>
        </div>
        ${contactBox}
        ${payBox}
      </div>
    </div>
  `;

  const waBtn = $('#wa-btn');
  if (waBtn) {
    waBtn.addEventListener('click', () => {
      const fresh = DB.subscribers.find(s => s.id === me.id);
      if (fresh && !fresh.paid) { fresh.paymentClaimed = true; fresh.claimCycle = activeCycleKey(fresh.billDate); saveData(); }
      setTimeout(() => renderSubscriberProfile(DB.subscribers.find(s => s.id === me.id) || me), 400);
    });
  }
  document.querySelectorAll('.copy-btn').forEach(b => b.addEventListener('click', () => {
    const v = b.getAttribute('data-copy');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(v).then(() => toast('تم النسخ ✅')).catch(() => toast('انسخ يدويًا: ' + v));
    } else { toast('انسخ يدويًا: ' + v); }
  }));
}

/* ---------- الإعدادات (تغيير كلمة السر) ---------- */
function renderSettings(sess) {
  let acctC = null;
  if (sess.role === 'admin') acctC = DB.admin;
  else if (sess.role === 'intermediary') acctC = DB.intermediaries.find(i => i.id === sess.id);
  const curWa = (acctC && acctC.whatsapp) || '';
  const curVf = (acctC && acctC.vfcash) || '';
  const curIp = (acctC && acctC.instapay) || '';
  const waField = (sess.role === 'admin' || sess.role === 'intermediary') ? `
        <div class="field"><label>رقم واتساب (لاستقبال إثبات الدفع)</label><input id="wa-num" value="${esc(curWa)}" placeholder="01xxxxxxxxx" /></div>
        <div class="field"><label>رقم فودافون كاش (اللي المشترك يحوّل عليه)</label><input id="vf-num" value="${esc(curVf)}" placeholder="01xxxxxxxxx" /></div>
        <div class="field"><label>حساب إنستا باي (InstaPay)</label><input id="ip-acc" value="${esc(curIp)}" placeholder="name@instapay أو الرقم" /></div>
        <button class="btn btn-primary btn-block" id="contact-save">حفظ بيانات الدفع</button>
        <div class="hint" style="margin-top:.4rem">دي البيانات اللي هتظهر لمشتركينك في صفحتهم عشان يدفعوا لك.</div>
        <hr style="border:none;border-top:1px solid var(--line);margin:1.2rem 0" />` : '';
  $('#content').innerHTML = `
    <div class="profile">
      <div class="section-head"><h2>الإعدادات</h2></div>
      <div class="profile-card"><div class="profile-rows">
        ${waField}
        <div class="field"><label>كلمة السر الحالية</label><input id="cur-pass" type="password" placeholder="كلمة السر الحالية" /></div>
        <div class="field"><label>كلمة السر الجديدة</label><input id="new-pass" type="password" placeholder="كلمة سر جديدة" /></div>
        <button class="btn btn-primary btn-block" id="chg-pass">تغيير كلمة السر</button>
        ${sess.role === 'admin' ? `<div class="field" style="margin-top:1.4rem"><label>تصدير / استيراد البيانات</label>
          <div class="row-actions" style="flex-wrap:wrap">
            <button class="btn btn-light btn-sm" id="exp">تصدير نسخة احتياطية</button>
            <button class="btn btn-light btn-sm" id="imp">استيراد</button>
          </div>
          <div class="hint">البيانات محفوظة في هذا المتصفح فقط. اعمل نسخة احتياطية بانتظام.</div></div>` : ''}
      </div></div>
    </div>
  `;
  const contactSaveBtn = $('#contact-save');
  if (contactSaveBtn) {
    contactSaveBtn.addEventListener('click', () => {
      const wa = $('#wa-num').value.trim();
      const vf = $('#vf-num').value.trim();
      const ip = $('#ip-acc').value.trim();
      const target = sess.role === 'admin' ? DB.admin : DB.intermediaries.find(i => i.id === sess.id);
      if (target) { target.whatsapp = wa; target.vfcash = vf; target.instapay = ip; }
      saveData(); toast('تم حفظ بيانات الدفع');
    });
  }

  $('#chg-pass').addEventListener('click', () => {
    const cur = $('#cur-pass').value, np = $('#new-pass').value;
    if (!np) return toast('اكتب كلمة السر الجديدة');
    let acct;
    if (sess.role === 'admin') acct = DB.admin;
    else if (sess.role === 'intermediary') acct = DB.intermediaries.find(i => i.id === sess.id);
    else acct = DB.subscribers.find(s => s.id === sess.id);
    if (acct.password !== cur) return toast('كلمة السر الحالية غير صحيحة');
    acct.password = np; saveData(); toast('تم تغيير كلمة السر'); $('#cur-pass').value = ''; $('#new-pass').value = '';
  });
  if (sess.role === 'admin') {
    $('#exp').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(DB, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'vodafone-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
    });
    $('#imp').addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'application/json';
      inp.onchange = () => {
        const f = inp.files[0]; if (!f) return;
        const r = new FileReader();
        r.onload = () => {
          try { DB = JSON.parse(r.result); saveData(); toast('تم الاستيراد'); rerenderCurrent(); }
          catch (e) { toast('ملف غير صالح'); }
        };
        r.readAsText(f);
      };
      inp.click();
    });
  }
}

/* ---------- تشغيل + مزامنة السحابة ---------- */
async function initApp() {
  if (!window.supabase) { setTimeout(initApp, 200); return; }
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  try {
    const remote = await pullRemote();
    if (!remote) { DB = defaultData(); await pushRemote(); }
    else { DB = migrate(remote); }
  } catch (e) {
    console.error('load error', e);
    const raw = localStorage.getItem(STORE_KEY);
    DB = raw ? migrate(JSON.parse(raw)) : defaultData();
    toast('⚠️ تعذّر الاتصال بالسحابة — تحقق من إعداد الجدول');
  }
  if (applyBillingResets()) saveData();
  boot();
  subscribeRealtime();
  // فحص دوري: لو عدّى يوم فتح الدفع والتطبيق مفتوح، يعمل ريسيت ويحدّث الشاشة
  setInterval(() => {
    if (applyBillingResets()) {
      saveData();
      if (getSession() && !$('#app-view').classList.contains('hidden')) rerenderCurrent();
    }
  }, 3600000);
}

// تحديث لحظي لما البيانات تتغيّر من أي جهاز
function subscribeRealtime() {
  if (!sb) return;
  sb.channel('app_state_rt')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_state', filter: 'id=eq.' + STATE_ID }, payload => {
      if (payload.new && payload.new.data) {
        const tag = (document.activeElement && document.activeElement.tagName) || '';
        const typing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(tag);
        const modalOpen = !$('#modal').classList.contains('hidden');
        // متقاطعش المستخدم وهو بيعدّل/بيكتب — هيتحدّث في التغيير الجاي
        if (modalOpen || typing) return;
        DB = payload.new.data;
        const loggedIn = getSession() && !$('#app-view').classList.contains('hidden');
        if (loggedIn) rerenderCurrent();
      }
    })
    .subscribe();
}

/* ---------- الوضع الليلي (دارك مود) ---------- */
function setupTheme() {
  const btn = $('#theme-btn');
  if (!btn) return;
  const sync = () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    btn.textContent = dark ? '☀️' : '🌙';
    btn.title = dark ? 'الوضع النهاري' : 'الوضع الليلي';
  };
  sync();
  btn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('vf_theme', next); } catch (e) {}
    sync();
    toast(next === 'dark' ? '🌙 الوضع الليلي' : '☀️ الوضع النهاري');
  });
}

setupTheme();
initApp();
