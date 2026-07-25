/* Створення .docx у браузері без жодних бібліотек.
   .docx — це ZIP з кількох XML-файлів; тут є мінімальний ZIP-writer (метод "store")
   і генератор WordprocessingML. Працює офлайн, нічого нікуди не надсилає. */
(function (global) {
  'use strict';

  // ─── CRC32 ─────────────────────────────────────────────
  var CRC = (function () {
    var t = new Uint32Array(256), c, i, k;
    for (i = 0; i < 256; i++) {
      c = i;
      for (k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  })();

  function crc32(buf) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // ─── ZIP (store, без стиснення) ────────────────────────
  function zip(files) {
    var enc = new TextEncoder(), parts = [], central = [], offset = 0;
    var d = new Date();
    var dosTime = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
    var dosDate = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;

    function u16(v) { return [v & 0xFF, (v >>> 8) & 0xFF]; }
    function u32(v) { return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]; }

    files.forEach(function (f) {
      var name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
      var head = [].concat(
        [0x50, 0x4B, 0x03, 0x04], u16(20), u16(0x0800), u16(0), u16(dosTime), u16(dosDate),
        u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
      parts.push(new Uint8Array(head), name, data);
      central.push({ name: name, crc: crc, size: data.length, offset: offset });
      offset += head.length + name.length + data.length;
    });

    var cdir = [];
    central.forEach(function (c) {
      var head = [].concat(
        [0x50, 0x4B, 0x01, 0x02], u16(20), u16(20), u16(0x0800), u16(0), u16(dosTime), u16(dosDate),
        u32(c.crc), u32(c.size), u32(c.size), u16(c.name.length),
        u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.offset));
      cdir.push(new Uint8Array(head), c.name);
    });
    var cdirSize = cdir.reduce(function (s, a) { return s + a.length; }, 0);
    var eocd = new Uint8Array([].concat(
      [0x50, 0x4B, 0x05, 0x06], u16(0), u16(0), u16(central.length), u16(central.length),
      u32(cdirSize), u32(offset), u16(0)));

    var all = parts.concat(cdir, [eocd]);
    var total = all.reduce(function (s, a) { return s + a.length; }, 0);
    var out = new Uint8Array(total), pos = 0;
    all.forEach(function (a) { out.set(a, pos); pos += a.length; });
    return out;
  }

  // ─── WordprocessingML ──────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/\u2019/g, '\u2019');
  }

  var FONT = 'Times New Roman';

  function rpr(o) {
    o = o || {};
    return '<w:rFonts w:ascii="' + FONT + '" w:hAnsi="' + FONT + '" w:cs="' + FONT + '"/>'
      + (o.bold ? '<w:b/>' : '') + (o.italic ? '<w:i/>' : '')
      + (o.caps ? '<w:caps/>' : '')
      + (o.color ? '<w:color w:val="' + o.color + '"/>' : '')
      + '<w:sz w:val="' + (o.size || 24) + '"/><w:szCs w:val="' + (o.size || 24) + '"/>';
  }

  function P(text, o) {
    o = o || {};
    // порядок дочірніх елементів <w:pPr> визначений схемою: tabs → spacing → jc → rPr
    var pr = '<w:pPr>'
      + (o.tabRight ? '<w:tabs><w:tab w:val="right" w:pos="9638"/></w:tabs>' : '')
      + '<w:spacing w:before="' + (o.before || 0) + '" w:after="'
      + (o.after == null ? 120 : o.after) + '" w:line="276" w:lineRule="auto"/>'
      + (o.align ? '<w:jc w:val="' + o.align + '"/>' : '')
      + '<w:rPr>' + rpr(o) + '</w:rPr></w:pPr>';
    var runs = '';
    (Array.isArray(text) ? text : [text]).forEach(function (chunk) {
      if (chunk === '\t') { runs += '<w:r><w:tab/></w:r>'; return; }
      if (chunk === '' || chunk == null) return;
      runs += '<w:r><w:rPr>' + rpr(o) + '</w:rPr><w:t xml:space="preserve">' + esc(chunk) + '</w:t></w:r>';
    });
    return '<w:p>' + pr + runs + '</w:p>';
  }

  function cell(text, w, o) {
    o = o || {};
    return '<w:tc><w:tcPr><w:tcW w:w="' + w + '" w:type="dxa"/>'
      + (o.shade ? '<w:shd w:val="clear" w:color="auto" w:fill="' + o.shade + '"/>' : '')
      + '<w:vAlign w:val="center"/></w:tcPr>'
      + P(text, { bold: o.bold, size: 22, after: 0 }) + '</w:tc>';
  }

  function infoTable(rows) {
    var W1 = 3300, W2 = 6338;
    var body = rows.map(function (r) {
      return '<w:tr>' + cell(r[0], W1, { bold: true, shade: 'F2F2F2' }) + cell(r[1], W2) + '</w:tr>';
    }).join('');
    return '<w:tbl><w:tblPr><w:tblW w:w="9638" w:type="dxa"/>'
      + '<w:tblBorders>'
      + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (s) {
        return '<w:' + s + ' w:val="single" w:sz="6" w:space="0" w:color="808080"/>';
      }).join('')
      + '</w:tblBorders>'
      + '<w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/>'
      + '<w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar>'
      + '</w:tblPr><w:tblGrid><w:gridCol w:w="3300"/><w:gridCol w:w="6338"/></w:tblGrid>'
      + body + '</w:tbl>';
  }

  /* opts: {clinic, name, birth, num, date, study, referrer, desc, concl, doctor} */
  function documentXml(o) {
    var rows = [
      ['Пацієнт (ПІБ)', o.name],
      ['Дата народження / вік', o.birth],
      ['№ знімка / дослідження', o.num],
      ['Дата дослідження', o.date],
      ['Вид дослідження, проєкція', o.study],
      ['Направив (лікар, відділення)', o.referrer]
    ].filter(function (r) { return r[1] || ['Пацієнт (ПІБ)', '№ знімка / дослідження', 'Дата дослідження'].indexOf(r[0]) >= 0; });

    var body = ''
      + P(o.clinic || 'Заклад охорони здоров\u2019я: ______________________________________________',
          { size: 20, color: '444444', after: 60 })
      + P('Рентгенологічний кабінет', { size: 20, color: '444444', after: 240 })
      + P('ПРОТОКОЛ РЕНТГЕНОЛОГІЧНОГО ДОСЛІДЖЕННЯ',
          { bold: true, align: 'center', size: 28, after: 40 })
      + P('навколоносові пазухи · порожнина носа · носоглотка · скроневі кістки',
          { align: 'center', size: 20, color: '444444', after: 220 })
      + infoTable(rows)
      + P('', { after: 160 })
      + P('ОПИС:', { bold: true, after: 60 })
      + P(o.desc || '', { after: 200 })
      + P('ВИСНОВОК:', { bold: true, after: 60 })
      + P(o.concl || '', { after: 400 })
      + P(['Дата: «____» ____________ 20____ р.', '\t', 'М. П.'], { tabRight: true, after: 360 })
      + P(['Лікар-рентгенолог  ____________________', '\t',
           (o.doctor || '____________________________')], { tabRight: true, after: 0 })
      + P(['(підпис)', '\t', '(прізвище, ініціали)'], { tabRight: true, size: 18, color: '666666' })
      + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
      + '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" '
      + 'w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>';

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
      + '<w:body>' + body + '</w:body></w:document>';
  }

  function build(o) {
    return zip([
      {
        name: '[Content_Types].xml',
        data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
          + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
          + '<Default Extension="xml" ContentType="application/xml"/>'
          + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
          + '</Types>'
      },
      {
        name: '_rels/.rels',
        data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
          + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
          + '</Relationships>'
      },
      {
        name: 'word/_rels/document.xml.rels',
        data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'
      },
      { name: 'word/document.xml', data: documentXml(o) }
    ]);
  }

  global.DocxGen = { build: build };
})(typeof window !== 'undefined' ? window : globalThis);
