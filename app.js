/* app.js — ספר המתכונים. Vanilla JS, data lives in localStorage. */
(function () {
  'use strict';
  const P = window.RB;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // ---------- storage ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('rb.' + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem('rb.' + k, JSON.stringify(v)); } catch (_) { toast('לא ניתן לשמור — האחסון מלא או חסום'); } },
  };
  const S = {
    recipes: store.get('recipes', []),
    sel: store.get('sel', {}),            // { recipeId: servings }
    checked: store.get('checked', {}),    // { itemId: true }
    extras: store.get('extras', []),      // [{ id, text, done }]
    crop: null, q: '', url: '', txt: '', view: {}, draft: null, tab: 'text', busy: false, msg: null,
  };
  const save = (k) => store.set(k, S[k]);
  const byId = (id) => S.recipes.find((r) => r.id === id);

  // ---------- helpers ----------
  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }
  const base = (r) => r.servings || 1;
  const servingsOf = (r) => S.sel[r.id] ?? S.view[r.id] ?? base(r);
  const factorOf = (r) => servingsOf(r) / base(r);
  const stepNum = (r) => P.fmtNum(servingsOf(r));                       // 1, 1½, 4 …
  const stepLabel = (r) => (servingsOf(r) === 1 ? 'מנה' : stepNum(r) + ' מנות');   // used where there is no heading (shopping list)
  const stepSize = () => 0.5;                                          // halves are allowed everywhere
  const selIds = () => Object.keys(S.sel).filter((id) => byId(id));

  function stepper(r, withUnit) {
    return `<div class="stepper">
      <button data-act="serv" data-id="${r.id}" data-d="1" aria-label="להגדיל כמויות" title="להגדיל כמויות">＋</button>
      <span>${esc(withUnit ? stepLabel(r) : stepNum(r))}</span>
      <button data-act="serv" data-id="${r.id}" data-d="-1" aria-label="להקטין כמויות" title="להקטין כמויות">−</button></div>`;
  }

  // recipe-page stepper: the number is a text field (digits and one dot only)
  const numStr = (r) => String(Math.round(servingsOf(r) * 100) / 100);
  function qtyStepper(r) {
    return `<div class="stepper">
      <button data-act="serv" data-id="${r.id}" data-d="1" aria-label="להגדיל כמויות" title="להגדיל (חצי מנה)">＋</button>
      <input id="qty" class="qty" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" maxlength="6" dir="ltr"
        value="${esc(numStr(r))}" data-id="${r.id}" aria-label="מספר מנות">
      <button data-act="serv" data-id="${r.id}" data-d="-1" aria-label="להקטין כמויות" title="להקטין (חצי מנה)">−</button></div>`;
  }
  function setServings(id, v) {
    if (S.sel[id] != null) { S.sel[id] = v; save('sel'); } else S.view[id] = v;
  }

  // ---------- routing ----------
  const route = () => {
    const h = location.hash.replace(/^#\/?/, '');
    const [name, arg] = h.split('/');
    return { name: name || 'list', arg: arg ? decodeURIComponent(arg) : '' };
  };
  window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

  function render() {
    const { name, arg } = route();
    const v = $('#view');
    let nav = 'list';
    if (name === 'add' || name === 'edit') nav = 'add';
    if (name === 'shop') nav = 'shop';
    document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.nav === nav));

    if (name === 'r') v.innerHTML = viewDetail(arg);
    else if (name === 'edit') v.innerHTML = viewEditor(arg);
    else if (name === 'add') v.innerHTML = viewImport();
    else if (name === 'shop') v.innerHTML = viewShop();
    else v.innerHTML = viewList();
    chrome();
  }

  // selection bar + badge (always in sync with state)
  function chrome() {
    const n = selIds().length;
    const b = $('#badge'); b.hidden = !n; b.textContent = n;
    const bar = $('#selbar');
    const show = n > 0 && route().name !== 'shop';
    bar.hidden = !show;
    if (show) bar.innerHTML = `<span>נבחרו ${n} מתכונים</span>
      <button class="btn clr" data-act="clearsel">נקה</button>
      <button class="btn" data-act="goshop">🛒 לרשימת קניות</button>`;
  }

  // ---------- views ----------
  function cardHtml(r) {
    const on = !!S.sel[r.id];
    const meta = [r.ingredients.filter((l) => !P.isHeaderLine(l)).length + ' מרכיבים', r.servings ? r.servings + ' מנות' : ''].filter(Boolean).join(' · ');
    return `<article class="card ${on ? 'sel' : ''}">
      <button class="pick" data-act="toggle" data-id="${r.id}" aria-pressed="${on}" aria-label="${on ? 'הסר מהרשימה' : 'בחר לרשימת קניות'}">${on ? '✔' : '○'}</button>
      <a class="main" href="#/r/${r.id}"><h3>${esc(r.title)}</h3><p class="meta">${esc(meta)}</p></a></article>`;
  }
  function listHtml() {
    const q = P.norm(S.q).toLowerCase();
    const rs = S.recipes.filter((r) => !q || (r.title + ' ' + r.ingredients.join(' ')).toLowerCase().includes(q));
    if (!S.recipes.length) return `<div class="empty"><div class="big">🍲</div><h2>עוד אין מתכונים</h2>
      <p>הוסיפי מתכון מטקסט, מקישור או מקובץ — ואז סמני כמה מתכונים וקבלי רשימת קניות.</p>
      <a class="btn" href="#/add">＋ הוספת מתכון ראשון</a></div>`;
    if (!rs.length) return `<div class="empty"><p>לא נמצאו מתכונים ל־"${esc(S.q)}"</p></div>`;
    return `<div class="cards">${rs.map(cardHtml).join('')}</div>`;
  }
  function viewList() {
    return `<h1>ספר המתכונים</h1>
      ${S.recipes.length > 3 ? `<div class="search"><input type="search" id="q" placeholder="חיפוש מתכון או מרכיב…" value="${esc(S.q)}"></div>` : ''}
      <div id="list">${listHtml()}</div>
      ${S.recipes.length ? `<div class="foot"><button data-act="export">⬇ גיבוי</button><button data-act="restore">⬆ שחזור</button></div>` : ''}`;
  }

  function viewDetail(id) {
    const r = byId(id);
    if (!r) return `<div class="empty"><p>המתכון לא נמצא</p><a class="btn" href="#/">חזרה</a></div>`;
    const f = factorOf(r), on = !!S.sel[r.id];
    const ing = r.ingredients.map((line) => {
      const p = P.parseIngredient(line);
      if (!p) return '';
      if (p.header) return `<li class="h">${esc(p.name)}</li>`;
      if (p.qty == null) return `<li>${esc(p.raw)}</li>`;
      const t = P.formatAmount(p.qty * f, p.unit, p.name, P.canonName(p.name));
      return `<li>${esc(t)}${p.note ? ` <small>(${esc(p.note)})</small>` : ''}</li>`;
    }).join('');
    const src = r.source ? `<p class="sub"><a href="${esc(r.source)}" target="_blank" rel="noopener">מקור המתכון ↗</a></p>` : '';
    return `<div class="top"><a class="iconbtn" href="#/" aria-label="חזרה" style="display:grid;place-items:center;text-decoration:none">→</a><h1>${esc(r.title)}</h1></div>
      ${src}
      <div class="toolbar">
        <a class="iconbtn" href="#/edit/${r.id}" aria-label="עריכת המתכון" title="עריכה">✏</a>
        <button class="iconbtn del" data-act="del" data-id="${r.id}" aria-label="מחיקת המתכון" title="מחיקה">🗑</button>
        <button class="btn ${on ? 'soft' : ''}" data-act="toggle" data-id="${r.id}">${on ? '✔ ברשימת הקניות' : '🛒 הוספה לקניות'}</button>
      </div>
      <div class="qtyrow">
        <div class="qtyinfo"><label for="qty"><b>מספר מנות</b> <small>(אפשר גם חצאים)</small></label>
          <p class="sub">${servingsOf(r) !== base(r) ? `הכמויות והרשימה הותאמו. <b>במתכון המקורי: ${P.fmtNum(base(r))}</b>` : 'משנה את הכמויות במתכון וברשימת הקניות.'}</p></div>
        ${qtyStepper(r)}
      </div>
      <h2>מצרכים</h2><div class="panel"><ul class="ing">${ing || '<li>—</li>'}</ul></div>
      <h2>אופן הכנה</h2><div class="panel">${r.steps.length ? `<ol class="steps">${r.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : '<p class="sub" style="padding:12px 0">אין שלבי הכנה</p>'}</div>
    `;
  }

  function viewEditor(id) {
    const isNew = id === 'new';
    const r = isNew ? (S.draft || { title: '', servings: null, ingredients: [], steps: [], source: '' }) : byId(id);
    if (!r) return `<div class="empty"><p>המתכון לא נמצא</p></div>`;
    const imported = isNew && S.draft && S.draft.fromImport;
    return `<div class="top"><a class="iconbtn" href="${isNew ? '#/add' : '#/r/' + r.id}" style="display:grid;place-items:center;text-decoration:none">→</a><h1>${isNew ? 'מתכון חדש' : 'עריכת מתכון'}</h1></div>
      ${imported ? `<div class="note ${S.draft.fromImage ? 'err' : ''}">${S.draft.fromImage ? '📷 הטקסט זוהה מתמונה — זיהוי עברית לא מושלם, במיוחד במספרים (למשל 200 עלול לצאת 0). בדקי כל כמות לפני השמירה.' : '✨ זיהינו את המתכון. כדאי לעבור על זה ולתקן לפני השמירה.'}</div>` : ''}
      ${S.draft && S.draft.warn ? `<div class="note err">${esc(S.draft.warn)}</div>` : ''}
      <form id="editor" data-id="${esc(id)}" autocomplete="off">
        <label class="f">שם המתכון</label>
        <input type="text" name="title" value="${esc(r.title)}" required placeholder="למשל: עוגת שוקולד">
        <label class="f">מספר מנות <small>(לא חובה — מאפשר להגדיל/להקטין כמויות)</small></label>
        <input type="number" name="servings" min="1" max="200" inputmode="numeric" value="${r.servings || ''}">
        <label class="f">מצרכים <small>(שורה לכל מצרך, למשל: 2 כוסות קמח. שורה שמסתיימת ב־: היא כותרת)</small></label>
        <textarea name="ingredients" rows="9" required>${esc(r.ingredients.join('\n'))}</textarea>
        <label class="f">אופן הכנה <small>(שורה לכל שלב)</small></label>
        <textarea name="steps" rows="8">${esc(r.steps.join('\n'))}</textarea>
        <input type="hidden" name="source" value="${esc(r.source || '')}">
        <div class="row" style="margin-top:18px"><button class="btn" type="submit">💾 שמירה</button>
        <a class="btn ghost" href="${isNew ? '#/add' : '#/r/' + r.id}">ביטול</a></div>
      </form>`;
  }

  function cropView() {
    const c = S.crop, r = c.rect;
    const box = r ? `left:${r.x * 100}%;top:${r.y * 100}%;width:${r.w * 100}%;height:${r.h * 100}%` : 'display:none';
    const msg = S.msg ? `<div class="note ${S.msg.err ? 'err' : ''}">${esc(S.msg.text)}</div>` : '';
    return `<div class="top"><button class="iconbtn" data-act="crop-cancel" aria-label="ביטול">→</button><h1>סימון אזור המתכון</h1></div>
      <p class="sub">${c.draw ? 'גררי עם האצבע על התמונה כדי לסמן את אזור המתכון.' : 'כדי לקבל זיהוי טוב יותר, סמני רק את אזור המתכון (בלי שאר המסך). או זהי את כל התמונה.'}</p>
      ${msg}
      <div class="cropwrap ${c.draw ? 'draw' : ''}" id="cropwrap"><img id="cropimg" src="${esc(c.url)}" alt="" draggable="false"><div class="cropbox" id="cropbox" style="${box}"></div></div>
      <div class="actions">
        <button class="btn ghost" data-act="crop-draw" ${S.busy ? 'disabled' : ''}>${c.draw ? '✋ גלילה' : r ? '✂ סימון מחדש' : '✂ סימון אזור'}</button>
        <button class="btn" data-act="crop-go" ${S.busy ? 'disabled' : ''}>${S.busy ? '<span class="spin"></span> קורא…' : r ? '✨ זיהוי האזור' : '✨ זיהוי כל התמונה'}</button>
      </div>`;
  }

  async function runOcr() {
    const c = S.crop;
    S.busy = true; S.msg = { text: 'מתחיל…' }; render();
    try {
      const r = P.parseRecipeText(await imageToText(c.file, c.rect));
      r.fromImage = true;
      // OCR reads "½" as "4"; a singular "4 כוס/כפית" is ungrammatical Hebrew, so it is almost surely ½ (images only)
      r.ingredients = r.ingredients.map((l) => l.replace(/^4\s+(?=(כוס|כפית)(\s|$))/, '½ '));
      URL.revokeObjectURL(c.url); S.crop = null;
      finishImport(r, 'file');
    } catch (e) {
      S.busy = false;
      S.msg = { err: true, text: 'לא הצלחנו לזהות טקסט בתמונה. בפעם הראשונה נדרש חיבור לאינטרנט.' }; render();
    }
  }

  // drag-to-select on the preview image (only while "draw" mode is on, so the page can still scroll normally)
  let dragStart = null;
  document.addEventListener('pointerdown', (e) => {
    const w = e.target.closest('#cropwrap'); if (!w || !S.crop || !S.crop.draw) return;
    const b = $('#cropimg').getBoundingClientRect();
    dragStart = { x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) };
    w.setPointerCapture(e.pointerId);
  });
  document.addEventListener('pointermove', (e) => {
    if (!dragStart) return;
    const b = $('#cropimg').getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y = Math.min(1, Math.max(0, (e.clientY - b.top) / b.height));
    const r = { x: Math.min(dragStart.x, x), y: Math.min(dragStart.y, y), w: Math.abs(x - dragStart.x), h: Math.abs(y - dragStart.y) };
    S.crop.rect = r;
    const el = $('#cropbox'); el.style.cssText = `left:${r.x * 100}%;top:${r.y * 100}%;width:${r.w * 100}%;height:${r.h * 100}%`;
  });
  const endDrag = () => {
    if (!dragStart) return; dragStart = null;
    if (S.crop.rect && (S.crop.rect.w < 0.05 || S.crop.rect.h < 0.03)) S.crop.rect = null;   // accidental tap
    S.crop.draw = false; render();
  };
  document.addEventListener('pointerup', endDrag); document.addEventListener('pointercancel', endDrag);

  function viewImport() {
    if (S.crop) return cropView();
    const t = S.tab;
    const seg = `<div class="seg" role="tablist">
      ${[['text', '✍ טקסט'], ['url', '🔗 קישור'], ['file', '📄 קובץ']].map(([k, l]) => `<button role="tab" data-act="tab" data-k="${k}" aria-selected="${t === k}">${l}</button>`).join('')}</div>`;
    const msg = S.msg ? `<div class="note ${S.msg.err ? 'err' : ''}">${esc(S.msg.text)}</div>` : '';
    let body = '';
    if (t === 'text') body = `<label class="f">הדביקי כאן מתכון</label>
      <textarea id="txt" rows="12" placeholder="שם המתכון&#10;&#10;מצרכים:&#10;2 כוסות קמח&#10;3 ביצים&#10;&#10;אופן ההכנה:&#10;מערבבים ואופים…">${esc(S.txt)}</textarea>
      <button class="btn block" id="go-text" style="margin-top:12px" data-act="parse-text" ${S.txt.trim() ? '' : 'disabled'}>✨ זיהוי מתכון</button>`;
    if (t === 'url') body = `<label class="f">קישור למתכון באתר</label>
      <input type="url" id="url" class="ltr" inputmode="url" placeholder="https://…" value="${esc(S.url)}">
      <button class="btn block" id="go-url" style="margin-top:12px" data-act="parse-url" ${S.busy || !S.url.trim() ? 'disabled' : ''}>${S.busy ? '<span class="spin"></span> מביא…' : '🔗 ייבוא מהקישור'}</button>
      <p class="sub" style="margin-top:10px">הקישור נשלח לשירות עזר כדי לקרוא את הדף. אם האתר חוסם — פשוט העתיקי את הטקסט ללשונית "טקסט".</p>`;
    if (t === 'file') body = `<label class="drop" for="file"><div style="font-size:40px">📄</div><b>בחירת קובץ או תמונה</b><br>תמונה / צילום מסך, pdf, txt, html (או גיבוי json)
      <input type="file" id="file" accept="image/*,.txt,.md,.pdf,.html,.htm,.json,text/plain,application/pdf,text/html,application/json"></label>`;
    return `<h1>הוספת מתכון</h1>${seg}${msg}${body}
      <p class="sub" style="margin-top:22px;text-align:center">או <a href="#/edit/new" data-act="manual">כתיבה ידנית משדה ריק</a></p>`;
  }

  // ---------- shopping ----------
  function entries() {
    return selIds().map((id) => { const r = byId(id); return { title: r.title, lines: r.ingredients, factor: factorOf(r) }; });
  }
  function currentItems() { return P.buildShoppingList(entries()); }

  function viewShop() {
    const ids = selIds();
    if (!ids.length && !S.extras.length) return `<h1>רשימת קניות</h1><div class="empty"><div class="big">🛒</div>
      <p>עוד לא נבחרו מתכונים.<br>סמני מתכונים במסך הראשי והרשימה תיבנה לבד.</p><a class="btn" href="#/">לבחירת מתכונים</a></div>`;
    const items = currentItems();
    const groups = {};
    items.forEach((i) => (groups[i.category] = groups[i.category] || []).push(i));
    const recs = ids.map((id) => { const r = byId(id); return `<div class="srecipe"><span class="t">${esc(r.title)}</span>${stepper(r, true)}
      <button class="x" data-act="toggle" data-id="${r.id}" aria-label="הסר" style="appearance:none;border:0;background:none;font-size:18px;color:var(--muted);padding:8px">✕</button></div>`; }).join('');
    const itemHtml = (i) => `<li class="${S.checked[i.id] ? 'done' : ''}"><label><input type="checkbox" data-act="check" data-id="${esc(i.id)}" ${S.checked[i.id] ? 'checked' : ''}>
      <span class="tx"><span>${esc(i.text)}</span>${i.from.length > 1 || ids.length > 1 ? `<small>${esc(i.from.join(' · '))}</small>` : ''}</span></label></li>`;
    const cats = P.CAT_ORDER.filter((c) => groups[c]).map((c) => `<div class="cat">${esc(c)}</div><ul class="items">${groups[c].map(itemHtml).join('')}</ul>`).join('');
    const extras = S.extras.length ? `<div class="cat">נוספים</div><ul class="items">${S.extras.map((e) => `<li class="${e.done ? 'done' : ''}"><label>
      <input type="checkbox" data-act="xcheck" data-id="${e.id}" ${e.done ? 'checked' : ''}><span class="tx"><span>${esc(e.text)}</span></span>
      <button class="x" type="button" data-act="xdel" data-id="${e.id}" aria-label="מחיקה">✕</button></label></li>`).join('')}</ul>` : '';
    const left = items.filter((i) => !S.checked[i.id]).length + S.extras.filter((e) => !e.done).length;
    return `<h1>רשימת קניות</h1><p class="sub">${left} פריטים לקנייה</p>
      <h2>מתכונים</h2><div class="srecipes">${recs || '<p class="sub">אין מתכונים נבחרים</p>'}</div>
      ${cats}${extras}
      <form class="addrow" id="addextra"><input type="text" name="t" placeholder="הוספת פריט משלי…" autocomplete="off"><button class="btn soft" type="submit">＋</button></form>
      <div class="actions"><button class="btn ghost" data-act="copy">📋 העתקה</button><button class="btn wa" data-act="wa">💬 וואטסאפ</button>
        ${navigator.share ? '<button class="btn ghost" data-act="share">⤴ שיתוף</button>' : ''}</div>
      <div class="row"><button class="btn danger" data-act="clearchecked">נקה מסומנים</button><button class="btn danger" data-act="clearall">התחלה מחדש</button></div>`;
  }

  function shopText() {
    const items = currentItems().filter((i) => !S.checked[i.id]);
    const groups = {};
    items.forEach((i) => (groups[i.category] = groups[i.category] || []).push(i));
    const out = ['*רשימת קניות*'];   // no 4-byte emoji: wa.me's web redirect corrupts them
    const names = selIds().map((id) => byId(id).title);
    if (names.length) out.push('למתכונים: ' + names.join(', '));
    P.CAT_ORDER.filter((c) => groups[c]).forEach((c) => { out.push('', '*' + c + '*'); groups[c].forEach((i) => out.push('• ' + i.text)); });
    const ex = S.extras.filter((e) => !e.done);
    if (ex.length) { out.push('', '*נוספים*'); ex.forEach((e) => out.push('• ' + e.text)); }
    return out.join('\n');
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (_) {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (_) { /* noop */ }
      ta.remove(); return ok;
    }
  }

  // ---------- import ----------
  function finishImport(r, via) {
    if (!r || (!r.ingredients.length && !r.steps.length)) {
      S.msg = { err: true, text: 'לא הצלחנו לזהות מתכון בתוכן הזה. נסי להעתיק את הטקסט ללשונית "טקסט", או לכתוב ידנית.' };
      S.busy = false; render(); return;
    }
    S.draft = { title: r.title || '', servings: r.servings || null, ingredients: r.ingredients, steps: r.steps, source: r.source || '', fromImport: true, fromImage: !!r.fromImage,
      warn: via === 'text' && r.source ? 'הדף לא כלל מתכון מסודר, אז הזיהוי הוא ניחוש — בדקי היטב.' : '' };
    S.msg = null; S.busy = false; S.url = ''; S.txt = '';
    location.hash = '#/edit/new';
  }

  const enc = encodeURIComponent;
  async function getWithTimeout(url, ms) {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
    try { const res = await fetch(url, { signal: c.signal }); if (!res.ok) throw new Error(res.status); return await res.text(); } finally { clearTimeout(t); }
  }
  async function importUrl(url) {
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    const htmlSources = [
      (u) => './api/fetch?url=' + enc(u),                       // own Vercel function, if deployed
      (u) => 'https://api.allorigins.win/raw?url=' + enc(u),
    ];
    let best = null;
    for (const mk of htmlSources) {
      try {
        const html = await getWithTimeout(mk(url), 12000);
        if (!/<html|<!doctype|<body/i.test(html)) continue;
        const r = P.recipeFromHtml(html, url);
        if (r.via === 'schema' || (r.ingredients.length && r.steps.length)) return r;
        best = best || r;
      } catch (_) { /* try next */ }
    }
    try {   // text-only reader as last resort
      const md = await getWithTimeout('https://r.jina.ai/' + url, 20000);
      const text = md.replace(/^(Title|URL Source|Published Time|Markdown Content):.*$/gm, '').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[#*_`>]+/g, '');
      const r = P.parseRecipeText(text);
      const t = md.match(/^Title:\s*(.+)$/m); if (t && !r.title) r.title = t[1].trim();
      r.source = url;
      if (r.ingredients.length || r.steps.length) return r;
    } catch (_) { /* fallthrough */ }
    return best;
  }

  let pdfLoading;
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return (pdfLoading = pdfLoading || new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; ok(window.pdfjsLib); };
      s.onerror = () => { pdfLoading = null; no(new Error('pdf.js')); };
      document.head.appendChild(s);
    }));
  }
  async function pdfToText(file) {
    const lib = await loadPdfJs();
    const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
    const out = [];
    for (let i = 1; i <= Math.min(pdf.numPages, 15); i++) {
      const c = await (await pdf.getPage(i)).getTextContent();
      const rows = new Map();
      c.items.forEach((it) => { if (!it.str.trim()) return; const y = Math.round(it.transform[5] / 3); (rows.get(y) || rows.set(y, []).get(y)).push(it); });
      [...rows.keys()].sort((a, b) => b - a).forEach((y) => {
        const its = rows.get(y);
        const heb = (its.map((x) => x.str).join('').match(/[֐-׿]/g) || []).length > 3;
        its.sort((a, b) => (heb ? b.transform[4] - a.transform[4] : a.transform[4] - b.transform[4]));
        out.push(its.map((x) => x.str).join(' ').replace(/\s+/g, ' '));
      });
    }
    return out.join('\n');
  }

  // ---- OCR for photos / screenshots of recipes (Tesseract, loaded on demand; language data cached after first use) ----
  const TESS_VER = '5.1.1';
  let tessLoading;
  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    return (tessLoading = tessLoading || new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@' + TESS_VER + '/dist/tesseract.min.js';
      s.onload = () => ok(window.Tesseract);
      s.onerror = () => { tessLoading = null; no(new Error('tesseract')); };
      document.head.appendChild(s);
    }));
  }
  function setStatus(text) { S.msg = { text }; const n = $('.note'); if (n) n.textContent = text; }
  // Recipe cards are often two columns (ingredients | method). Find a blank vertical strip near the middle and
  // return its x position, so each column can be read separately instead of Tesseract interleaving the lines.
  function findColumnGap(cv) {
    const w = cv.width, h = cv.height;
    const d = cv.getContext('2d').getImageData(0, 0, w, h).data;
    const dark = new Uint32Array(w);
    for (let y = 0; y < h; y += 2) for (let x = 0, i = y * w * 4; x < w; x++, i += 4) if (d[i] < 120) dark[x]++;
    const limit = Math.max(2, h * 0.002);
    let best = { s: 0, len: 0 }, run = 0, start = 0;
    for (let x = Math.floor(w * 0.25); x < Math.ceil(w * 0.75); x++) {
      if (dark[x] <= limit) { if (!run) start = x; run++; if (run > best.len) best = { s: start, len: run }; } else run = 0;
    }
    return best.len >= w * 0.018 ? Math.round(best.s + best.len / 2) : null;
  }

  async function imageToText(file, rect) {
    setStatus('טוען מנוע זיהוי טקסט…');
    const T = await loadTesseract();
    const bmp = await createImageBitmap(file);
    const r = rect || { x: 0, y: 0, w: 1, h: 1 };
    const sx = r.x * bmp.width, sy = r.y * bmp.height, sw = r.w * bmp.width, sh = r.h * bmp.height;
    let k = Math.max(0.5, Math.min(4, 2200 / sw));                      // small text needs enlarging; huge photos shrink
    if (sw * sh * k * k > 20e6) k = Math.sqrt(20e6 / (sw * sh));         // keep the canvas within phone memory limits
    const cv = document.createElement('canvas'); cv.width = Math.round(sw * k); cv.height = Math.round(sh * k);
    const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.imageSmoothingQuality = 'high';
    cx.filter = 'grayscale(1) contrast(1.6)';      // measurably better on screenshots with coloured backgrounds
    cx.drawImage(bmp, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    // "best" Hebrew model is far more accurate than the default fast one; cached in IndexedDB after the first download
    const worker = await T.createWorker('heb', 1, {
      langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/heb/4.0.0_best_int', gzip: true,
      logger: (m) => {
        if (m.status === 'recognizing text') setStatus('מזהה טקסט… ' + Math.round(m.progress * 100) + '%');
        else if (/language|traineddata/.test(m.status || '')) setStatus('מוריד נתוני שפה עברית (פעם ראשונה בלבד, כמה שניות)…');
      } });
    try {
      await worker.setParameters({ tessedit_pageseg_mode: '3' });
      const gap = rect ? findColumnGap(cv) : null;                         // only for a user-marked area (a full screenshot has no clean gap)
      if (!gap) return (await worker.recognize(cv)).data.text;
      const part = (x0, x1) => { const c = document.createElement('canvas'); c.width = x1 - x0; c.height = cv.height; c.getContext('2d').drawImage(cv, x0, 0, x1 - x0, cv.height, 0, 0, x1 - x0, cv.height); return c; };
      await worker.setParameters({ tessedit_pageseg_mode: '6' });            // a single column is one uniform block
      setStatus('מזהה טקסט… (עמודה 1 מתוך 2)');
      const right = (await worker.recognize(part(gap, cv.width))).data.text;   // Hebrew reads right-to-left: right column first
      setStatus('מזהה טקסט… (עמודה 2 מתוך 2)');
      const left = (await worker.recognize(part(0, gap))).data.text;
      return right + '\n' + left;
    } finally { await worker.terminate(); }
  }

  const isImage = (f) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|heic|gif|bmp)$/i.test(f.name);
  async function handleFile(file) {
    if (isImage(file)) {
      if (S.crop) URL.revokeObjectURL(S.crop.url);
      S.crop = { file, url: URL.createObjectURL(file), rect: null, draw: false };
      S.busy = false; S.msg = null; render(); return;
    }
    S.busy = true; S.msg = { text: 'קורא את הקובץ…' }; render();
    try {
      const name = file.name.toLowerCase();
      if (name.endsWith('.json')) {
        const data = JSON.parse(await file.text());
        const arr = Array.isArray(data) ? data : data.recipes;
        if (Array.isArray(arr) && arr.every((r) => r && r.title && Array.isArray(r.ingredients))) {
          let added = 0;
          arr.forEach((r) => { if (!byId(r.id)) { S.recipes.push({ ...r, id: r.id || uid(), steps: r.steps || [] }); added++; } });
          save('recipes'); S.busy = false; S.msg = null; toast(`שוחזרו ${added} מתכונים`); location.hash = '#/'; return;
        }
        throw new Error('json');
      }
      let r;
      if (name.endsWith('.pdf')) r = P.parseRecipeText(await pdfToText(file));
      else if (/\.html?$/.test(name)) r = P.recipeFromHtml(await file.text(), '');
      else r = P.parseRecipeText(await file.text());
      if (!r.title) r.title = file.name.replace(/\.[^.]+$/, '');
      finishImport(r, 'file');
    } catch (e) {
      S.busy = false;
      S.msg = { err: true, text: name_is_pdf(file) ? 'לא הצלחנו לקרוא את ה־PDF (נדרש חיבור לאינטרנט, וקבצים סרוקים כתמונה לא נתמכים). נסי להעתיק את הטקסט.'
        : 'לא הצלחנו לקרוא את הקובץ.' };
      render();
    }
  }
  const name_is_pdf = (f) => /\.pdf$/i.test(f.name);

  // ---------- actions ----------
  function toggleSel(id) {
    const r = byId(id); if (!r) return;
    if (S.sel[id] != null) delete S.sel[id]; else S.sel[id] = servingsOf(r);
    save('sel');
  }
  function bumpServ(id, d) {
    const r = byId(id); if (!r) return;
    const next = Math.max(stepSize(r), +(servingsOf(r) + d * stepSize(r)).toFixed(2));
    if (S.sel[id] != null) { S.sel[id] = next; save('sel'); } else S.view[id] = next;
  }
  function exportBackup() {
    const blob = new Blob([JSON.stringify({ app: 'recipe-book', exported: new Date().toISOString(), recipes: S.recipes }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'recipes-' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const act = el.dataset.act, id = el.dataset.id;
    switch (act) {
      case 'toggle': e.preventDefault(); toggleSel(id); render(); break;
      case 'serv': bumpServ(id, +el.dataset.d); render(); break;
      case 'clearsel': S.sel = {}; save('sel'); render(); break;
      case 'goshop': location.hash = '#/shop'; break;
      case 'del': if (confirm('למחוק את המתכון?')) { S.recipes = S.recipes.filter((r) => r.id !== id); delete S.sel[id]; save('recipes'); save('sel'); location.hash = '#/'; toast('המתכון נמחק'); } break;
      case 'tab': S.tab = el.dataset.k; S.msg = null; render(); break;
      case 'manual': S.draft = null; break;
      case 'crop-draw': S.crop.draw = !S.crop.draw; render(); break;
      case 'crop-go': runOcr(); break;
      case 'crop-cancel': URL.revokeObjectURL(S.crop.url); S.crop = null; S.msg = null; S.busy = false; render(); break;
      case 'parse-text': {
        const t = $('#txt').value.trim(); if (!t) { toast('הדביקי קודם טקסט'); break; }
        finishImport(P.parseRecipeText(t), 'text'); break;
      }
      case 'parse-url': {
        const u = $('#url').value.trim(); if (!u) { toast('הדביקי קישור'); break; }
        S.url = u; S.busy = true; S.msg = null; render();
        const r = await importUrl(u);
        if (!r) { S.busy = false; S.msg = { err: true, text: 'לא הצלחנו להביא את הדף (ייתכן שהאתר חוסם גישה). העתיקי את טקסט המתכון ללשונית "טקסט".' }; render(); }
        else finishImport(r, r.via);
        break;
      }
      case 'check': S.checked[id] = el.checked || undefined; if (!el.checked) delete S.checked[id]; save('checked'); render(); break;
      case 'xcheck': { const x = S.extras.find((v) => v.id === id); if (x) x.done = el.checked; save('extras'); render(); break; }
      case 'xdel': e.preventDefault(); S.extras = S.extras.filter((v) => v.id !== id); save('extras'); render(); break;
      case 'copy': toast((await copyText(shopText())) ? 'הרשימה הועתקה ✔' : 'ההעתקה נכשלה'); break;
      case 'wa': window.open('https://wa.me/?text=' + enc(shopText()), '_blank', 'noopener'); break;
      case 'share': try { await navigator.share({ text: shopText() }); } catch (_) { /* cancelled */ } break;
      case 'clearchecked': S.checked = {}; S.extras = S.extras.filter((x) => !x.done); save('checked'); save('extras'); render(); break;
      case 'clearall': if (confirm('לנקות את הרשימה ולבטל את הבחירה של כל המתכונים?')) { S.sel = {}; S.checked = {}; S.extras = []; ['sel', 'checked', 'extras'].forEach(save); render(); } break;
      case 'export': exportBackup(); break;
      case 'restore': S.tab = 'file'; location.hash = '#/add'; break;
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'qty') {                                  // digits and a single dot only
      const t = e.target; let v = t.value.replace(/,/g, '.').replace(/[^0-9.]/g, '');
      const i = v.indexOf('.'); if (i >= 0) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '');
      if (v !== t.value) t.value = v;
    }
    if (e.target.id === 'url') { S.url = e.target.value; $('#go-url').disabled = S.busy || !S.url.trim(); }
    if (e.target.id === 'txt') { S.txt = e.target.value; $('#go-text').disabled = !S.txt.trim(); }
    if (e.target.id === 'q') { S.q = e.target.value; $('#list').innerHTML = listHtml(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'qty') e.target.blur(); });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'qty') {
      const v = Math.round(parseFloat(e.target.value) * 100) / 100;
      if (v > 0) setServings(e.target.dataset.id, Math.min(v, 999)); else toast('אפשר להקליד רק מספר גדול מ־0');
      render(); return;
    }
    if (e.target.id === 'file' && e.target.files[0]) handleFile(e.target.files[0]);
  });
  document.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target, fd = new FormData(f);
    if (f.id === 'addextra') {
      const t = String(fd.get('t') || '').trim(); if (!t) return;
      S.extras.push({ id: uid(), text: t, done: false }); save('extras'); render(); return;
    }
    if (f.id === 'editor') {
      const lines = (k) => String(fd.get(k) || '').split(/\r?\n/).map((l) => P.norm(l)).filter(Boolean);
      const rec = { title: P.norm(fd.get('title')), servings: Math.round(+fd.get('servings')) || null,
        ingredients: lines('ingredients'), steps: lines('steps'), source: String(fd.get('source') || '') };
      if (!rec.title || !rec.ingredients.length) { toast('צריך שם ולפחות מצרך אחד'); return; }
      const id = f.dataset.id;
      let rid = id;
      if (id === 'new') { rid = uid(); S.recipes.unshift({ id: rid, created: Date.now(), ...rec }); }
      else { Object.assign(byId(id), rec); if (S.sel[id] != null && !rec.servings) S.sel[id] = 1; save('sel'); }
      S.draft = null; delete S.view[rid]; save('recipes');
      toast('נשמר ✔'); location.hash = '#/r/' + rid;
    }
  });

  // ---------- boot ----------
  render();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then((reg) => { reg.update().catch(() => {}); }).catch(() => {});
  }
})();
