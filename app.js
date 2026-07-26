/* Логіка форми. Дані — у data-phrases.js та data-diagnoses.js, Word — у docxgen.js.
   Тут нічого правити не потрібно, щоб додати чи змінити фразу. */
(function () {
  'use strict';

  var PH = window.PHRASES, BL = window.BLOCKS;
  var DX = window.DIAGNOSES, DG = window.DIAG_GROUPS, SS = window.SIDESETS;

  // стан позначок: окремо для опису та для висновку
  var ps = PH.map(function () { return { on: false, s: '', n1: '', n2: '' }; });
  var ds = DX.map(function () { return { on: false, s: '', n1: '', n2: '' }; });

  var tab = 'desc', mod = 'all', q = '', onlyChecked = false;

  var CLINIC = 'КНП «МКЛ №27» ХМР, вул. Гуданова, 5-7';

  var $ = function (id) { return document.getElementById(id); };
  var V = function (id) { return ($(id).value || '').trim(); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function fill(tpl, st) {
    return tpl.replace('{S}', st.s || '').replace('{N1}', st.n1 || '').replace('{N2}', st.n2 || '')
      .replace(/\s{2,}/g, ' ').replace(/\s+([.,;:)])/g, '$1').trim();
  }

  // ── збірка тексту ────────────────────────────────────────
  // Проєкція/модальність — це шапка бланка, а не речення опису,
  // тому ці фрази виносяться в окремий рядок і в тіло опису не потрапляють.
  function isStudy(p) { return p.block === BL[0] && p.group === 'Проекція'; }

  function studyLine() {
    var out = [];
    PH.forEach(function (p, i) {
      if (ps[i].on && isStudy(p)) out.push(fill(p.text, ps[i]).replace(/\.$/, ''));
    });
    return out.join('; ');
  }

  function description() {
    var out = [];
    PH.forEach(function (p, i) { if (ps[i].on && !isStudy(p)) out.push(fill(p.text, ps[i])); });
    return out.join(' ');
  }

  function conclusion() {
    var signs = [], raws = [];
    DX.forEach(function (d, i) {
      if (!ds[i].on) return;
      (d.raw ? raws : signs).push(fill(d.text, ds[i]));
    });
    if (signs.length || raws.length) {
      var t = signs.length ? 'Ознаки: ' + signs.join(', ') + '.' : '';
      if (raws.length) t = (t ? t + ' ' : '') + raws.join(' ');
      return { text: t, src: 'з позначених діагнозів' };
    }
    var auto = [];
    PH.forEach(function (p, i) {
      if (!ps[i].on || !p.conclusion) return;
      var c = fill(p.conclusion, ps[i]);
      if (auto.indexOf(c) < 0) auto.push(c);
    });
    return {
      text: auto.length ? auto.join('; ').replace(/^./, function (c) { return c.toUpperCase(); }) + '.' : '',
      src: auto.length ? 'зібрано автоматично з опису' : ''
    };
  }

  // ── малювання списків ────────────────────────────────────
  function control(kind, i, o) {
    if (kind === 'side') {
      return '<select data-i="' + i + '" data-k="s" aria-label="сторона">'
        + '<option value="">…сторона</option>'
        + o.map(function (s) { return '<option>' + s + '</option>'; }).join('') + '</select>';
    }
    return '<input type="text" data-i="' + i + '" data-k="' + kind + '" placeholder="' + esc(o)
      + '" title="' + esc(o) + '" aria-label="' + esc(o) + '">';
  }

  function phraseHtml(p, i) {
    var h = esc(p.text);
    if (h.indexOf('{S}') >= 0) h = h.replace('{S}', control('side', i, SS.adv));
    h = h.replace('{N1}', control('n1', i, p.p1)).replace('{N2}', control('n2', i, p.p2));
    return h;
  }

  function diagHtml(d, i) {
    var h = esc(d.text);
    if (h.indexOf('{S}') >= 0) h = h.replace('{S}', control('side', i, SS[d.sides] || SS.adv));
    h = h.replace('{N1}', control('n1', i, d.p1));
    return h;
  }

  function row(i, inner, checked, extra, cls) {
    return '<div class="item' + (checked ? ' checked' : '') + (cls ? ' ' + cls : '') + '">'
      + '<input type="checkbox" data-i="' + i + '" data-k="on"' + (checked ? ' checked' : '')
      + ' aria-label="позначити"><span class="txt">' + inner + '</span>'
      + (extra ? '<span class="mod">' + esc(extra) + '</span>' : '') + '</div>';
  }

  function section(title, bi, rowsHtml, open) {
    var det = document.createElement('details');
    det.className = 'block';
    det.open = open;
    det.innerHTML = '<summary>' + esc(title) + '<span class="badge" data-bb="' + bi + '"></span></summary>'
      + rowsHtml;
    return det;
  }

  function matches(text, group) {
    return !q || text.toLowerCase().indexOf(q) >= 0 || group.toLowerCase().indexOf(q) >= 0;
  }

  function buildList() {
    var root = $('list');
    root.innerHTML = '';
    var groups = tab === 'desc' ? BL : DG;
    var items = tab === 'desc' ? PH : DX;
    var st = tab === 'desc' ? ps : ds;
    var key = tab === 'desc' ? 'block' : 'group';
    var shown = 0;

    groups.forEach(function (gname, gi) {
      var html = '', lastSub = null;
      items.forEach(function (it, i) {
        if (it[key] !== gname) return;
        if (tab === 'desc' && mod !== 'all' && it.mod.indexOf(mod) < 0) return;
        if (!matches(it.text, tab === 'desc' ? it.group : gname)) return;
        if (onlyChecked && !st[i].on) return;
        if (tab === 'desc' && it.group !== lastSub) {
          html += '<div class="group">' + esc(it.group) + '</div>';
          lastSub = it.group;
        }
        html += tab === 'desc'
          ? row(i, phraseHtml(it, i), st[i].on, it.mod)
          : row(i, diagHtml(it, i), st[i].on, '', it.raw ? 'raw' : '');
      });
      if (!html) return;
      shown++;
      root.appendChild(section(gname, gi, html, !!(q || onlyChecked) || gi < 1));
    });

    if (!shown) root.innerHTML = '<div class="nores">Нічого не знайдено. Спробуйте інше слово.</div>';

    root.querySelectorAll('[data-k]').forEach(function (el) {
      var s = st[el.dataset.i], k = el.dataset.k;
      if (k === 'on') el.checked = s.on; else el.value = s[k];
    });
    updateBadges();
  }

  function updateBadges() {
    var groups = tab === 'desc' ? BL : DG;
    var items = tab === 'desc' ? PH : DX;
    var st = tab === 'desc' ? ps : ds;
    var key = tab === 'desc' ? 'block' : 'group';
    groups.forEach(function (gname, gi) {
      var n = 0;
      items.forEach(function (it, i) { if (it[key] === gname && st[i].on) n++; });
      var el = document.querySelector('[data-bb="' + gi + '"]');
      if (el) { el.textContent = n; el.className = 'badge' + (n ? ' on' : ''); }
    });
  }

  function plural(n) {
    return n + (n % 10 === 1 && n % 100 !== 11 ? ' позначка' : ' позначок');
  }

  function updatePreview() {
    var d = description(), c = conclusion();
    var np = ps.filter(function (s) { return s.on; }).length;
    var nd = ds.filter(function (s) { return s.on; }).length;

    var t1 = $('tally-desc'), t2 = $('tally-dx');
    t1.textContent = np; t1.className = 'tally' + (np ? ' on' : '');
    t2.textContent = nd; t2.className = 'tally' + (nd ? ' on' : '');
    $('cnt').textContent = plural(np + nd);

    var study = studyLine();
    $('pv').innerHTML =
      (study ? '<div class="sect"><h3>Дослідження</h3><div class="body">' + esc(study) + '</div></div>' : '')
      + '<div class="sect"><h3>Опис</h3><div class="body">'
      + (d ? esc(d) : '<span class="empty">Позначте знахідки на вкладці «Опис».</span>') + '</div></div>'
      + '<div class="sect"><h3>Висновок' + (c.src ? ' <em>· ' + c.src + '</em>' : '') + '</h3>'
      + '<div class="body">' + (c.text ? esc(c.text) : '<span class="empty">—</span>') + '</div></div>';
    updateBadges();
  }

  // ── події ────────────────────────────────────────────────
  $('list').addEventListener('input', function (e) {
    var el = e.target; if (!el.dataset.k) return;
    var st = (tab === 'desc' ? ps : ds)[el.dataset.i];
    if (el.dataset.k === 'on') st.on = el.checked;
    else {
      st[el.dataset.k] = el.value;
      if (el.value && !st.on) {
        st.on = true;
        var cb = document.querySelector('input[type=checkbox][data-i="' + el.dataset.i + '"]');
        if (cb) cb.checked = true;
      }
    }
    var r = el.closest('.item'); if (r) r.classList.toggle('checked', st.on);
    updatePreview();
  });

  function switchTab(t) {
    tab = t;
    $('tab-desc').setAttribute('aria-selected', t === 'desc');
    $('tab-dx').setAttribute('aria-selected', t === 'dx');
    $('modseg').className = 'seg' + (t === 'dx' ? ' off' : '');
    $('q').placeholder = t === 'desc' ? 'Пошук по тексту фрази…' : 'Пошук по діагнозу…';
    buildList();
  }
  $('tab-desc').addEventListener('click', function () { switchTab('desc'); });
  $('tab-dx').addEventListener('click', function () { switchTab('dx'); });

  $('q').addEventListener('input', function (e) { q = e.target.value.trim().toLowerCase(); buildList(); });

  $('modseg').addEventListener('click', function (e) {
    if (e.target.tagName !== 'BUTTON') return;
    Array.prototype.forEach.call(this.querySelectorAll('button'), function (b) {
      b.setAttribute('aria-pressed', b === e.target);
    });
    mod = e.target.dataset.mod;
    buildList();
  });

  $('only').addEventListener('click', function (e) {
    onlyChecked = !onlyChecked;
    e.target.style.background = onlyChecked ? 'var(--accent)' : '#fff';
    e.target.style.color = onlyChecked ? '#fff' : '';
    buildList();
  });

  $('collapse').addEventListener('click', function () {
    document.querySelectorAll('details.block').forEach(function (d) { d.open = false; });
  });

  $('clear').addEventListener('click', function () {
    if (!confirm('Зняти всі позначки в описі і у висновку?')) return;
    ps = PH.map(function () { return { on: false, s: '', n1: '', n2: '' }; });
    ds = DX.map(function () { return { on: false, s: '', n1: '', n2: '' }; });
    buildList(); updatePreview();
  });

  $('helpbtn').addEventListener('click', function (e) {
    var on = $('help').classList.toggle('on');
    e.target.setAttribute('aria-expanded', on);
  });

  function toast(t) {
    var el = $('toast'); el.textContent = t;
    el.classList.add('on'); setTimeout(function () { el.classList.remove('on'); }, 1500);
  }

  document.querySelectorAll('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var ta = document.createElement('textarea');
      ta.value = b.dataset.copy === 'desc' ? description() : conclusion().text;
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('Скопійовано'); }
      catch (err) { toast('Скопіюйте вручну'); }
      ta.remove();
    });
  });

  function blankFields() {
    return {
      name: V('f_name'), age: V('f_age'), num: V('f_num'), date: V('f_date'),
      study: studyLine(), referrer: V('f_ref'), doctor: V('f_doc')
    };
  }

  $('savedocx').addEventListener('click', function () {
    var d = description();
    if (!d) { toast('Спершу позначте хоча б одну фразу'); return; }
    var o = blankFields();
    o.desc = d; o.concl = conclusion().text;
    var blob = new Blob([DocxGen.build(o)],
      { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    var fname = ('Протокол_' + (o.name || 'пацієнт') + '_' + (o.num || o.date))
      .replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_') + '.docx';
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = fname;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    toast('Збережено: ' + fname);
  });

  $('print').addEventListener('click', function () {
    var o = blankFields();
    var rows = [['Пацієнт (ПІБ)', o.name], ['Вік (повних років)', o.age],
                ['№ знімка / дослідження', o.num], ['Дата дослідження', o.date],
                ['Вид дослідження, проєкція', o.study], ['Направив', o.referrer]];
    $('printdoc').innerHTML =
      '<div class="letterhead">' + CLINIC + '<br>Рентген-діагностичний кабінет</div>'
      + '<h2>ПРОТОКОЛ РЕНТГЕНОЛОГІЧНОГО ДОСЛІДЖЕННЯ</h2>'
      + '<div class="cap">навколоносові пазухи &middot; порожнина носа &middot; носоглотка &middot; скроневі кістки</div>'
      + '<table>' + rows.filter(function (r) { return r[1] || r[0].indexOf('Пацієнт') === 0; })
        .map(function (r) { return '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>'; }).join('')
      + '</table>'
      + '<h3>Опис</h3><div class="body">' + esc(description()) + '</div>'
      + '<h3>Висновок</h3><div class="body">' + esc(conclusion().text) + '</div>'
      + '<p class="dateline">Дата: «____» ____________ 20____ р.</p>'
      + '<table class="sign"><tr><td>Лікар-рентгенолог</td><td class="c">____________________</td>'
      + '<td class="r">' + (esc(o.doctor) || '____________________') + '</td></tr>'
      + '<tr><td>М. П.</td><td class="c small">(підпис)</td>'
      + '<td class="r small">(прізвище, ініціали)</td></tr></table>';
    window.print();
  });

  var today = new Date();
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  $('f_date').value = pad(today.getDate()) + '.' + pad(today.getMonth() + 1) + '.' + today.getFullYear();
  switchTab('desc');
  updatePreview();
})();
