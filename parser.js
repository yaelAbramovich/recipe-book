/* parser.js — Hebrew recipe + ingredient parsing. Works in the browser (global RB) and in node (module.exports). */
(function (root) {
  'use strict';

  // ---------- text normalisation ----------
  function norm(s) {
    return String(s || '')
      .replace(/[֑-ׇ]/g, '')            // niqqud / cantillation
      .replace(/[“”״]/g, '"')       // ” “ ״
      .replace(/[‘’׳]/g, "'")       // ’ ‘ ׳
      .replace(/[ ‎‏‪-‮]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ---------- units ----------
  // key -> { fam, f (factor to base), one, many, words[] }
  const UNITS = {
    g:     { fam: 'mass', f: 1,    one: 'גרם',  many: 'גרם',   words: ['גרם', 'גרמים', 'גר', "גר'", "ג'", 'גר.'] },
    kg:    { fam: 'mass', f: 1000, one: 'ק"ג',  many: 'ק"ג',   words: ['ק"ג', 'קג', 'קילו', 'קילוגרם', 'קילוגרמים', 'ק״ג'] },
    ml:    { fam: 'vol',  f: 1,    one: 'מ"ל',  many: 'מ"ל',   words: ['מ"ל', 'מל', 'מיליליטר', 'מיליליטרים'] },
    l:     { fam: 'vol',  f: 1000, one: 'ליטר', many: 'ליטר',  words: ['ליטר', 'ליטרים', "ל'"] },
    cup:   { fam: 'cup',  f: 1,    one: 'כוס',  many: 'כוסות', words: ['כוס', 'כוסות', 'כוסית', 'כוסיות'] },
    tbsp:  { fam: 'tbsp', f: 1,    one: 'כף',   many: 'כפות',  words: ['כף', 'כפות'] },
    tsp:   { fam: 'tsp',  f: 1,    one: 'כפית', many: 'כפיות', words: ['כפית', 'כפיות'] },
    clove: { fam: 'clove', f: 1,   one: 'שן',   many: 'שיניים', words: ['שן', 'שיניים'] },
    pack:  { fam: 'pack', f: 1,    one: 'חבילה', many: 'חבילות', words: ['חבילה', 'חבילות', 'חבילת'] },
    can:   { fam: 'can',  f: 1,    one: 'קופסה', many: 'קופסאות', words: ['קופסה', 'קופסא', 'קופסאות', 'קופסת', 'פחית', 'פחיות'] },
    slice: { fam: 'slice', f: 1,   one: 'פרוסה', many: 'פרוסות', words: ['פרוסה', 'פרוסות'] },
    bag:   { fam: 'bag',  f: 1,    one: 'שקית', many: 'שקיות', words: ['שקית', 'שקיות'] },
    bottle:{ fam: 'bottle', f: 1,  one: 'בקבוק', many: 'בקבוקים', words: ['בקבוק', 'בקבוקים'] },
    bunch: { fam: 'bunch', f: 1,   one: 'צרור', many: 'צרורות', words: ['צרור', 'צרורות'] },
    pinch: { fam: 'pinch', f: 1,   one: 'קורט', many: 'קורט',  words: ['קורט'] },
    unit:  { fam: '',     f: 1,    one: '',     many: '',       words: ['יחידה', 'יחידות', "יח'", 'יח', 'חתיכה', 'חתיכות'] },
  };
  const WORD2UNIT = {};
  Object.keys(UNITS).forEach(k => UNITS[k].words.forEach(w => { WORD2UNIT[norm(w)] = k; }));

  // ---------- name synonyms (singular canonical, plural display) ----------
  const CANON = {
    'ביצים': 'ביצה', 'ביצה': 'ביצה', 'בצלים': 'בצל', 'עגבניות': 'עגבנייה', 'עגבניה': 'עגבנייה', 'עגבנייה': 'עגבנייה',
    'לימונים': 'לימון', 'גזרים': 'גזר', 'מלפפונים': 'מלפפון', 'תפוחים': 'תפוח', 'תפוחי אדמה': 'תפוח אדמה',
    'תפוחי-אדמה': 'תפוח אדמה', 'תפוח-אדמה': 'תפוח אדמה', 'פלפלים': 'פלפל', 'בטטות': 'בטטה', 'קישואים': 'קישוא',
    'חצילים': 'חציל', 'אבוקדו': 'אבוקדו', 'תפוזים': 'תפוז', 'בננות': 'בננה', 'שיני שום': 'שום', 'שן שום': 'שום',
    'שיניים שום': 'שום', 'שומים': 'שום', 'פטריות': 'פטריה', 'לימון': 'לימון',
  };
  const PLURAL = {
    'ביצה': 'ביצים', 'בצל': 'בצלים', 'עגבנייה': 'עגבניות', 'לימון': 'לימונים', 'גזר': 'גזרים', 'מלפפון': 'מלפפונים',
    'תפוח': 'תפוחים', 'תפוח אדמה': 'תפוחי אדמה', 'פלפל': 'פלפלים', 'בטטה': 'בטטות', 'קישוא': 'קישואים',
    'חציל': 'חצילים', 'תפוז': 'תפוזים', 'בננה': 'בננות', 'פטריה': 'פטריות',
  };

  // ---------- shopping categories (first match wins) ----------
  const CATEGORIES = [
    ['תבלינים', /(מלח|פלפל שחור|פלפל לבן|פפריקה|כמון|כורכום|קינמון|אורגנו|תימין|קארי|זעתר|אבקת (שום|בצל|מרק|חרדל|קפה)|תבלין|ג'ינג'ר טחון|מגוון תבלינ|(?<![א-ת])הל(?![א-ת])|גרידת|אגוז מוסקט|ציפורן|רוזמרין יבש|עלי דפנה|שומשום|זרעי|סומק|בהרט|חריף)/],
    ['שמנים', /(שמן|ספריי)/],
    ['שימורים ורטבים', /(רסק|שימורים|משומר|טונה|קטשופ|חרדל|מיונז|סויה|רוטב|טחינה|חומץ|זיתים|חמוצ|מרוסק|קופסת|ממרח|פסטו|סרירצ|צ'ילי מתוק|ממרח|מיסו|ויניגרט)/],
    ['חלב וביצים', /(חלב|גבינ|שמנת|חמאה|יוגורט|ביצ|קוטג|מוצרלה|פרמזן|לבנה|מרגרינה|קממבר|פטה|ריקוטה|מסקרפונה|שמנת|גאודה|עמק|צהובה|לאבנה|קפיר|אשל)/],
    ['בשר, עוף ודגים', /(עוף|חזה|(?<![א-ת])שוק(?![א-ת])|כנפי|בשר|טחון|סטייק|נקניק|שניצל|(?<![א-ת])דג(?![א-ת])|דגים|סלמון|פילה|אנטריקוט|המבורגר|קבב|כבד|צלי|נקניקיות|בייקון|פסטרמה|שרימפס|קציצות|טלה|הודו)/],
    ['מאפים ולחם', /(לחם|פיתה|פיתות|לחמני|טורטיי|בצק|חלה|באגט|לחמנ|בייגל|קרקר|וופל)/],
    ['יבשים ואפייה', /(קמח|סוכר|אורז|פסטה|ספגטי|אטריות|שמרים|אבקת אפייה|סודה לשתייה|קקאו|שוקולד|עדשים|חומוס|שיבולת|קורנפלור|עמילן|קוסקוס|בורגול|פירורי|אגוז|שקדים|צימוקים|פולנטה|וניל|דבש|סילאן|קוקוס|קורנפלקס|גרנולה|מלבי|פתיתים|קינואה|שעועית|(?<![א-ת])פול(?![א-ת])|תמרים|בוטנים|פיסטוק|קשיו|פקאן|סירופ|ג'לטין|מרציפן|ריבה|נוטלה|שוקו|קפה|(?<![א-ת])תה(?![א-ת])|(?<![א-ת])מים(?![א-ת]))/],
    ['ירקות ופירות', /(בצל|שום|עגבני|מלפפון|גזר|תפוח|תפוז|לימון|פלפל|חסה|כרוב|קישוא|חציל|בטטה|פטרוזיליה|כוסברה|שמיר|נענע|בזיליקום|פטריות|פטריה|אבוקדו|ברוקולי|כרובית|סלרי|דלעת|תירס|בננה|ענבים|תות|זנגביל|עירית|ירק|פירות|סלק|צנון|צנונית|לפת|שומר|תרד|מנגו|אפרסק|אגס|רימון|אשכולית|קלמנטינה|תאנ|אפונה|ג'ינג'ר|רוזמרין|טימין|מרווה|עלים|ירוק|סלט|כרישה|שרי)/],
  ];
  const OTHER_CAT = 'אחר';
  const CAT_ORDER = ['ירקות ופירות', 'בשר, עוף ודגים', 'חלב וביצים', 'מאפים ולחם', 'יבשים ואפייה', 'שימורים ורטבים', 'שמנים', 'תבלינים', OTHER_CAT];

  function categorize(name) {
    const n = norm(name);
    for (const [cat, re] of CATEGORIES) if (re.test(n)) return cat;
    return OTHER_CAT;
  }

  // ---------- numbers ----------
  const UNI_FRAC = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
  const WORD_FRAC = { 'חצי': 0.5, 'רבע': 0.25, 'שליש': 1 / 3, 'שלושת רבעי': 0.75, 'שלושה רבעי': 0.75 };

  // returns {qty, rest} or null. Handles: 2, 2.5, 2,5, 1/2, 1 1/2, 1½, ½, 2-3, "חצי", "רבע"
  function takeQty(s) {
    s = s.replace(/^כ[-־]?\s*(?=[\d½¼¾⅓⅔⅛])/, '').replace(/^בערך\s+/, '');
    let m;
    if ((m = s.match(/^(\d+)\s+(\d+)\/(\d+)(?!\d)/))) return { qty: +m[1] + m[2] / m[3], rest: s.slice(m[0].length) };
    if ((m = s.match(/^(\d+)?\s*([½¼¾⅓⅔⅛])/))) return { qty: (+m[1] || 0) + UNI_FRAC[m[2]], rest: s.slice(m[0].length) };
    if ((m = s.match(/^(\d+)\/(\d+)(?!\d)/))) return { qty: m[1] / m[2], rest: s.slice(m[0].length) };
    if ((m = s.match(/^(\d+(?:[.,]\d+)?)(?:\s*[-–־]\s*|\s+עד\s+)(\d+(?:[.,]\d+)?)/)))
      return { qty: parseFloat(m[2].replace(',', '.')), rest: s.slice(m[0].length) };   // range -> upper bound
    if ((m = s.match(/^(\d+(?:[.,]\d+)?)/))) {
      let q = parseFloat(m[1].replace(',', '.')), rest = s.slice(m[0].length);
      const w = rest.match(/^\s*ו?(חצי|רבע|שליש)(?=\s|$)/);                 // "2 וחצי"
      if (w) { q += WORD_FRAC[w[1]]; rest = rest.slice(w[0].length); }
      return { qty: q, rest };
    }
    if ((m = s.match(/^(שלושת רבעי|שלושה רבעי|חצי|רבע|שליש)(?=\s|$)/))) return { qty: WORD_FRAC[m[1]], rest: s.slice(m[0].length) };
    return null;
  }

  function takeUnit(s) {
    s = s.trim();
    // longest-first so "ק"ג" is matched before "ק", and punctuation like "גר'" works
    const m = s.match(/^([^\s\d]+?)(?=[\s,.:;(]|$)/);
    const m2 = s.match(/^(ק"ג|מ"ל|גר'|ג'|יח'|ל')(?=[\s,.:;(]|$)/);
    const w = norm(m2 ? m2[1] : m ? m[1] : '');
    // construct forms: "כוס" "קופסת" "חבילת" -> keep as unit, strip the construct-state "ת" is already in words
    if (w && WORD2UNIT[w]) {
      const len = (m2 ? m2[1] : m[1]).length;
      return { unit: WORD2UNIT[w], rest: s.slice(len) };
    }
    return null;
  }

  // ---------- ingredient line ----------
  function isHeaderLine(line) {
    const t = norm(line);
    return /[:：]$/.test(t) && !/\d/.test(t) || /^#+\s*/.test(t);
  }

  function cleanBullet(line) {
    return norm(line).replace(/^[•●○▪◦·*•·▪●○◦►▶✓✔☐□+-]+\s*/, '').replace(/^\[\s?\]\s*/, '')
      .replace(/^%\s*(?=(כוס|כף|כפית|ק"ג|ליטר|חבילה))/, '½ ');      // OCR often reads "½" as "%"
  }

  /** Parse one ingredient line -> { raw, qty|null, unit|'' , name, note, header } */
  function parseIngredient(line) {
    const raw = cleanBullet(line);
    if (!raw) return null;
    if (isHeaderLine(raw)) return { raw, header: true, name: raw.replace(/^#+\s*/, '').replace(/[:：]$/, '') };

    let s = raw, qty = null, unit = '', note = '';

    const q = takeQty(s);
    if (q) {
      qty = q.qty; s = q.rest.trim();
      const u = takeUnit(s);
      if (u) { unit = u.unit; s = u.rest.trim(); }
      else if ((s.match(/^(חצי|רבע)(?=\s)/))) { /* "2 חצי X" rare; ignore */ }
    } else {
      const u = takeUnit(s);                                   // "כוס קמח", "כוס וחצי קמח"
      if (u && /^(כוס|כף|כפית|קורט|שן|חבילה|קופסה|צרור|שקית|בקבוק|ליטר)/.test(norm(s))) {
        unit = u.unit; qty = 1; s = u.rest.trim();
        const w = s.match(/^ו(חצי|רבע|שליש)(?=\s|$)/);
        if (w) { qty += WORD_FRAC[w[1]]; s = s.slice(w[0].length).trim(); }
      } else {
        // trailing quantity: "קמח - 2 כוסות", "קמח: 2 כוסות", "בצל 2"
        const t = s.match(/^(.+?)\s*[-–:]\s*(\d[\d.,/\s]*)\s*([^\s\d,]+)?\s*$/) || s.match(/^(.+?)\s+(\d[\d.,/]*)\s*([^\s\d,]+)?\s*$/);
        if (t) {
          const q2 = takeQty(t[2]);
          const u2 = t[3] ? WORD2UNIT[norm(t[3])] : '';
          if (q2 && (u2 || !t[3])) { qty = q2.qty; unit = u2 || ''; s = t[1].trim(); }
        }
      }
    }

    const PREP = /^(קצוץ|קצוצה|קצוצים|קצוצות|פרוס|פרוסה|פרוסים|פרוסות|מגורד|מגורדת|מגורדים|חתוך|חתוכה|חתוכים|חתוכות|קלוף|קלופה|קלופים|קלופות|כתוש|כתושה|כתושים|מפורר|מפוררת|מומס|מומסת|מוקצף|מוקצפת|טחון דק|שטוף|שטופים)$/;
    {
      const toks = s.split(' ');
      const i = toks.findIndex((t, k) => k > 0 && PREP.test(t));
      if (i > 0) { note = toks.slice(i).join(' '); s = toks.slice(0, i).join(' '); }
    }
    // strip leading "של"/"מ" connectors: "2 כוסות של קמח"
    s = s.replace(/^של\s+/, '');
    // notes: parentheses, and anything after first comma
    const par = [];
    s = s.replace(/\(([^)]*)\)/g, (_, t) => { par.push(t.trim()); return ' '; }).replace(/\s+/g, ' ').trim();
    const ci = s.search(/[,،]/);
    if (ci > 0) { par.push(s.slice(ci + 1).trim()); s = s.slice(0, ci).trim(); }
    note = [note, ...par].filter(Boolean).join(', ');
    let cm;
    if (!unit && (cm = s.match(/^(?:שיני|שן|שיניים)\s+(.+)$/))) { unit = 'clove'; s = cm[1]; if (qty == null) qty = 1; }
    if (unit === 'pinch') { unit = ''; qty = null; }
    s = s.replace(/[.:;]+$/, '').trim();

    // line that is ONLY "קורט" etc -> keep raw as name
    if (!s) s = raw;
    return { raw, qty, unit, name: s, note, header: false };
  }

  function canonName(name) {
    let n = norm(name).replace(/[-־]/g, ' ').replace(/\s+/g, ' ');
    n = n.replace(/^(ה)(?=[א-ת]{3,})/, ''); // "הבצל" -> "בצל"
    return CANON[n] || n;
  }

  function famKey(unit) { return unit ? UNITS[unit].fam : ''; }

  // ---------- formatting ----------
  function fmtNum(x) {
    if (x == null || isNaN(x)) return '';
    const whole = Math.floor(x + 1e-9), frac = x - whole;
    const table = [[0, ''], [0.125, '⅛'], [0.25, '¼'], [1 / 3, '⅓'], [0.375, '⅜'], [0.5, '½'], [0.625, '⅝'], [2 / 3, '⅔'], [0.75, '¾'], [0.875, '⅞'], [1, '']];
    for (const [v, ch] of table) {
      if (Math.abs(frac - v) < 0.03) {
        const w = v === 1 ? whole + 1 : whole;
        // LRM on both sides keeps "2½" in reading order inside right-to-left text (otherwise it renders as "½2")
        if (ch) return w ? '\u200E' + w + ch + '\u200E' : ch;
        return String(w);
      }
    }
    return String(Math.round(x * 10) / 10).replace(/\.0$/, '');
  }

  // base value + unit key -> nicest unit (converts g->kg, ml->l)
  function niceUnit(base, unit) {
    if (unit === 'g' || unit === 'kg') return base >= 1000 ? { v: base / 1000, u: 'kg' } : { v: base, u: 'g' };
    if (unit === 'ml' || unit === 'l') return base >= 1000 ? { v: base / 1000, u: 'l' } : { v: base, u: 'ml' };
    return { v: base, u: unit };
  }

  function unitLabel(unit, qty) {
    if (!unit) return '';
    const u = UNITS[unit];
    return qty != null && qty > 1 ? u.many : u.one;
  }

  function displayName(key, firstName, qty) {
    if (qty != null && qty > 1 && PLURAL[key]) return PLURAL[key];
    if (qty != null && qty <= 1 && PLURAL[key] && !(firstName === PLURAL[key] && qty > 1)) return key;
    return firstName;
  }

  /** "2 כוסות קמח" */
  function formatAmount(qty, unit, name, key) {
    const parts = [];
    if (qty != null) parts.push(fmtNum(qty));
    const ul = unitLabel(unit, qty);
    if (ul) parts.push(ul);
    parts.push(key ? displayName(key, name, qty) : name);
    return parts.join(' ');
  }

  // ---------- shopping list aggregation ----------
  /**
   * recipes: [{ title, ingredients:[raw lines], servings }]
   * mults: { [index]: factor }
   * returns [{ key, name, qty, unit, note, category, from:[titles] }] sorted by category order then name
   */
  function buildShoppingList(entries) {
    const map = new Map();
    for (const { title, lines, factor } of entries) {
      for (const line of lines) {
        const p = parseIngredient(line);
        if (!p || p.header) continue;
        const key = canonName(p.name);
        if (!key) continue;
        const fam = famKey(p.unit);
        const mapKey = key + '|' + fam;
        let it = map.get(mapKey);
        if (!it) { it = { key, name: p.name, base: null, unit: p.unit, notes: new Set(), from: new Set() }; map.set(mapKey, it); }
        if (p.qty != null) {
          const base = p.qty * factor * (p.unit ? UNITS[p.unit].f : 1);
          it.base = (it.base || 0) + base;
          if (p.unit && it.unit && UNITS[p.unit].fam === UNITS[it.unit].fam && UNITS[p.unit].f > UNITS[it.unit].f) { /* keep smaller as base unit key */ }
          if (!it.unit && p.unit) it.unit = p.unit;
        }
        it.from.add(title);
      }
    }
    const items = [];
    for (const [mk, it] of map) {
      let qty = it.base, unit = it.unit;
      if (qty != null && unit) {
        // base is in the "base" unit of the family (g or ml, else 1:1)
        const baseUnit = unit === 'kg' ? 'g' : unit === 'l' ? 'ml' : unit;
        const nu = niceUnit(qty, baseUnit);
        qty = nu.v; unit = nu.u;
      }
      if (qty != null) qty = Math.round(qty * 100) / 100;
      items.push({
        id: mk, key: it.key, name: displayName(it.key, it.name, qty), qty, unit,
        text: formatAmount(qty, unit, it.name, it.key),
        category: categorize(it.key), from: [...it.from],
      });
    }
    items.sort((a, b) => CAT_ORDER.indexOf(a.category) - CAT_ORDER.indexOf(b.category) || a.name.localeCompare(b.name, 'he'));
    return items;
  }

  // ---------- free-text recipe parsing ----------
  const ING_H = /^(המצרכים|מצרכים|המרכיבים|מרכיבים|רכיבים|חומרים|מה צרי[ךר]\??|מצרכים ל.*|רשימת מצרכים|לבצק|למילוי)\s*[:：]?\s*$/;
  const STEP_H = /^(אופן ה?הכנה|ההכנה|הכנה|הוראות( הכנה)?|דרך ה?הכנה|שיטת ה?הכנה|אופן הכנה|אופן הכנת.*|שלבי ה?הכנה)\s*[:：]?\s*$/;
  const MAIN_ING_H = /^(המצרכים|מצרכים|המרכיבים|מרכיבים|רכיבים|חומרים|מה צרי[ךר]|רשימת מצרכים)(?=[\s:：?]|$)/;

  function findServings(lines) {
    for (const l of lines) {
      let m;
      if ((m = l.match(/(?:כמות|מספר)?\s*מנות\s*[:：-]?\s*(\d+)/)) || (m = l.match(/(\d+)\s*מנות/)) ||
          (m = l.match(/מתאים\s+ל[-־]?\s*(\d+)/)) || (m = l.match(/(\d+)\s*(?:סועדים|אנשים|יחידות)/)) ||
          (m = l.match(/תשואה\s*[:：-]?\s*(\d+)/)) || (m = l.match(/(?:ל|עבור)[-־]?\s*(\d+)\s*(?:מנות|סועדים)/)))
        return +m[1];
    }
    return null;
  }

  function splitSentences(text) {
    return text.split(/(?<=[.!?])\s+(?=[א-תA-Z0-9])/).map(s => s.trim()).filter(Boolean);
  }

  function cleanStep(l) {
    return norm(l).replace(/^(\d+[.)]|[•*·▪●○◦+-])\s*/, '').replace(/^שלב\s*\d+\s*[:.-]?\s*/, '');
  }

  const BULLET = /^[•●○▪◦·*►▶✓✔☐□+-]\s*/;

  function parseRecipeText(text) {
    const lines = String(text || '').split(/\r?\n/).map(norm).filter(Boolean);
    const out = { title: '', servings: findServings(lines), ingredients: [], steps: [] };
    if (!lines.length) return out;

    const hasIng = lines.some(l => MAIN_ING_H.test(l) && ING_H.test(l));
    const hasStep = lines.some(l => STEP_H.test(l));
    const isMeta = l => /^(כמות |מספר )?(מנות|תשואה|זמן (הכנה|בישול|אפייה)|רמת קושי)(?=[\s:：]|$)/.test(l) && l.length < 40;
    const looksIng = l => { const p = parseIngredient(l); return !!(p && (p.header || p.qty != null)); };

    let mode = 'pre';
    const pre = [];
    for (const l of lines) {
      if (isMeta(l)) continue;
      if (hasIng && ING_H.test(l) && MAIN_ING_H.test(l)) { mode = 'ing'; continue; }
      if (hasStep && STEP_H.test(l)) { mode = 'step'; continue; }
      if (mode === 'pre') pre.push(l);
      else if (mode === 'step' && out.steps.length && !BULLET.test(l) && !/^\d+[.)]/.test(l) && !/[.!?:]$/.test(out.steps[out.steps.length - 1])) {
        out.steps[out.steps.length - 1] += ' ' + l;              // wrapped line (OCR / PDF / narrow column)
      } else if (mode === 'ing' && out.ingredients.length && !BULLET.test(l) && /[\/,]$/.test(out.ingredients[out.ingredients.length - 1])) {
        out.ingredients[out.ingredients.length - 1] += ' ' + l;
      } else if (mode === 'ing') {
        // heading-less step text after ingredients: a long sentence without quantity
        const long = l.split(' ').length >= 9 || /[.!]$/.test(l) && l.split(' ').length >= 5;
        if (!hasStep && long && !looksIng(l)) { mode = 'step'; out.steps.push(cleanStep(l)); }
        else out.ingredients.push(cleanBullet(l));
      } else out.steps.push(cleanStep(l));
    }

    // title: first pre line (when it doesn't look like an ingredient)
    if (pre.length && !looksIng(pre[0]) && pre[0].length <= 80) out.title = pre.shift().replace(/^#+\s*/, '');

    if (!hasIng && !hasStep) {
      for (const l of pre) (looksIng(l) ? out.ingredients : out.steps).push(looksIng(l) ? cleanBullet(l) : cleanStep(l));
    } else if (!hasIng) {
      pre.forEach(l => out.ingredients.push(cleanBullet(l)));      // only a "הכנה" heading -> the rest is ingredients
    } else {
      pre.forEach(l => out.steps.push(cleanStep(l)));
    }

    if (out.steps.length === 1 && out.steps[0].length > 220) out.steps = splitSentences(out.steps[0]);
    out.ingredients = out.ingredients.filter(Boolean);
    out.steps = out.steps.filter(Boolean);
    return out;
  }

  // ---------- HTML (URL import) ----------
  function decodeEntities(s) {
    if (typeof DOMParser === 'undefined') return s;
    return new DOMParser().parseFromString('<!doctype html><body>' + s, 'text/html').body.textContent;
  }

  function flattenInstructions(x, out) {
    if (!x) return;
    if (typeof x === 'string') {
      decodeEntities(x.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|div)>/gi, '\n').replace(/<[^>]+>/g, ''))
        .split(/\n+/).forEach(t => { t = norm(t); if (t) out.push(t); });
    } else if (Array.isArray(x)) x.forEach(y => flattenInstructions(y, out));
    else if (typeof x === 'object') {
      if (x.itemListElement) flattenInstructions(x.itemListElement, out);
      else flattenInstructions(x.text || x.name, out);
    }
  }

  function findRecipeNode(data) {
    const stack = [data];
    while (stack.length) {
      const n = stack.pop();
      if (!n) continue;
      if (Array.isArray(n)) { stack.push(...n); continue; }
      if (typeof n !== 'object') continue;
      const t = [].concat(n['@type'] || []);
      if (t.some(x => /Recipe$/i.test(String(x)))) return n;
      if (n['@graph']) stack.push(n['@graph']);
      if (n.mainEntity) stack.push(n.mainEntity);
      if (n.itemListElement) stack.push(n.itemListElement);
    }
    return null;
  }

  function recipeFromHtml(html, url) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    // 1) schema.org/Recipe JSON-LD
    for (const sc of doc.querySelectorAll('script[type="application/ld+json"]')) {
      let data;
      try { data = JSON.parse(sc.textContent.replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, '')); } catch (_) { continue; }
      const r = findRecipeNode(data);
      if (!r) continue;
      const steps = []; flattenInstructions(r.recipeInstructions, steps);
      const ing = [].concat(r.recipeIngredient || r.ingredients || []).map(s => norm(decodeEntities(String(s)))).filter(Boolean);
      let servings = null;
      const y = [].concat(r.recipeYield || [])[0];
      if (y != null) { const m = String(y).match(/\d+/); if (m) servings = +m[0]; }
      if (ing.length || steps.length)
        return { title: norm(decodeEntities(String(r.name || ''))), servings, ingredients: ing, steps, source: url, via: 'schema' };
    }
    // 2) fall back to visible text
    doc.querySelectorAll('script,style,noscript,nav,header,footer,aside,form,iframe,svg').forEach(e => e.remove());
    doc.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
    doc.querySelectorAll('p,li,h1,h2,h3,h4,h5,h6,div,tr,section').forEach(e => e.append('\n'));
    const scope = doc.querySelector('article') || doc.querySelector('main') || doc.body;
    const text = (scope.textContent || '').split(/\n/).map(norm).filter(Boolean).join('\n');
    const r = parseRecipeText(text);
    const og = doc.querySelector('meta[property="og:title"]');
    const h1 = doc.querySelector('h1');
    r.title = norm((og && og.content) || (h1 && h1.textContent) || r.title || doc.title || '');
    r.source = url; r.via = 'text';
    return r;
  }

  const api = {
    norm, parseIngredient, parseRecipeText, recipeFromHtml, buildShoppingList, formatAmount, fmtNum,
    categorize, canonName, isHeaderLine, cleanBullet, UNITS, CAT_ORDER,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RB = api;
})(typeof self !== 'undefined' ? self : this);
