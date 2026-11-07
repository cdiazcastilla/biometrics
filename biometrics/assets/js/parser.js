/* Lectura de exportaciones de iVMS-4200 (Excel / CSV) y de cualquier archivo con
   columnas de persona + fecha/hora. Detecta encabezados en español e inglés. */
(function () {
  const FIELDS = {
    empId: { label: 'ID de empleado', aliases: ['employee id', 'id de empleado', 'id empleado', 'person id', 'id de persona', 'id persona', 'employee no', 'employee no.', 'no empleado', 'numero de empleado', 'n de empleado', 'user id', 'id de usuario', 'id usuario', 'id', 'codigo', 'cod', 'documento', 'cedula', 'employeenostring', 'employee number', 'person no', 'identificacion'] },
    name: { label: 'Nombre', aliases: ['name', 'nombre', 'person name', 'nombre de persona', 'nombre de la persona', 'employee name', 'nombre del empleado', 'nombre completo', 'full name', 'usuario', 'user name', 'persona', 'empleado'] },
    dept: { label: 'Área / Departamento', aliases: ['department', 'departamento', 'organization', 'organizacion', 'grupo', 'group', 'person group', 'grupo de personas', 'area', 'dependencia', 'cargo'] },
    datetime: { label: 'Fecha y hora', aliases: ['time', 'hora', 'date and time', 'fecha y hora', 'event time', 'hora del evento', 'authentication time', 'hora de autenticacion', 'tiempo', 'timestamp', 'fecha hora', 'check time', 'attendance time', 'hora de asistencia', 'marca de tiempo', 'datetime', 'fecha/hora', 'record time', 'hora de registro'] },
    date: { label: 'Fecha (si va aparte)', aliases: ['date', 'fecha', 'attendance date', 'fecha de asistencia', 'dia', 'day'] },
    device: { label: 'Dispositivo / punto', aliases: ['device name', 'nombre del dispositivo', 'dispositivo', 'device', 'resource name', 'nombre del recurso', 'door', 'puerta', 'door name', 'attendance check point', 'punto de control de asistencia', 'punto de control', 'access point', 'reader', 'lector', 'source', 'fuente', 'data source', 'origen de los datos', 'custom name', 'nombre personalizado', 'device serial no', 'sede'] },
    status: { label: 'Estado (entrada/salida)', aliases: ['attendance status', 'estado de asistencia', 'estado', 'status', 'direction', 'direccion', 'check type', 'tipo de marcacion', 'in out', 'entrada salida', 'attendance type'] },
    result: { label: 'Evento / resultado', aliases: ['authentication result', 'resultado de autenticacion', 'result', 'resultado', 'event type', 'event types', 'tipo de evento', 'tipos de evento', 'minor event type', 'tipo de evento menor', 'event description', 'descripcion del evento', 'evento', 'event', 'descripcion'] },
  };
  const FAIL_RE = /(fail|fall|deneg|denied|invalid|no autoriz|unauthori|no coincid|mismatch|timeout|tiempo de espera|no registrad|not register|stranger|extran|desconocid|unknown|expired|vencid|anti passback|antipassback|tamper|alarm)/;

  const Parser = { FIELDS };

  /* ---------- lectura de archivo ---------- */
  function decodeText(buf) {
    let txt = new TextDecoder('utf-8').decode(buf);
    if (txt.includes('�')) {
      try { txt = new TextDecoder('windows-1252').decode(buf); } catch (e) { /* mantener utf-8 */ }
    }
    if (txt.charCodeAt(0) === 0xfeff) txt = txt.slice(1);
    return txt;
  }

  function parseCSV(text) {
    const firstLines = text.split(/\r?\n/).slice(0, 15).join('\n');
    const cands = [',', ';', '\t', '|'];
    const delim = cands.map((d) => [d, firstLines.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.map((r) => r.map((v) => v.trim().replace(/^\t+/, ''))).filter((r) => r.some((v) => v !== ''));
  }

  async function readRows(file) {
    const buf = await file.arrayBuffer();
    const isCsv = /\.(csv|txt)$/i.test(file.name);
    if (isCsv) return { sheets: [{ name: 'CSV', rows: parseCSV(decodeText(buf)) }] };
    if (typeof XLSX === 'undefined') throw new Error('No se pudo cargar el lector de Excel (revisa tu conexión a internet).');
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    return {
      sheets: wb.SheetNames.map((n) => ({
        name: n,
        rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' })
          .filter((r) => r.some((v) => v !== '' && v != null)),
      })),
    };
  }

  /* ---------- detección de encabezados ---------- */
  function scoreHeader(h, field) {
    const n = U.norm(h);
    if (!n) return 0;
    const al = FIELDS[field].aliases;
    if (al.includes(n)) return 10 - al.indexOf(n) * 0.01;
    if (n.length > 3 && al.some((a) => a.length > 3 && (n.includes(a) || a.includes(n)))) return 3;
    return 0;
  }

  function detectMapping(headers) {
    const mapping = {};
    const used = new Set();
    const order = ['datetime', 'date', 'empId', 'name', 'dept', 'device', 'status', 'result'];
    for (const f of order) {
      let best = -1, bestScore = 0;
      headers.forEach((h, i) => {
        if (used.has(i)) return;
        const s = scoreHeader(h, f);
        if (s > bestScore) { bestScore = s; best = i; }
      });
      if (best >= 0) { mapping[f] = best; used.add(best); }
    }
    // "Fecha" sola sin columna de hora: úsala como fecha y hora
    if (mapping.datetime == null && mapping.date != null) { mapping.datetime = mapping.date; delete mapping.date; }
    return mapping;
  }

  function findHeaderRow(rows) {
    let best = 0, bestScore = -1;
    for (let i = 0; i < Math.min(rows.length, 25); i++) {
      const r = rows[i];
      let s = 0;
      for (const f of Object.keys(FIELDS)) s += Math.max(0, ...r.map((h) => (typeof h === 'string' ? scoreHeader(h, f) : 0)));
      if (s > bestScore) { bestScore = s; best = i; }
    }
    return best;
  }

  /* ---------- fechas ---------- */
  const DATE_ISO = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/;
  const DATE_XY = /(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/;
  const TIME = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])?\.?\s*m?\.?/i;

  function guessDateOrder(values) {
    let dmy = 0, mdy = 0;
    for (const v of values) {
      if (typeof v !== 'string') continue;
      if (DATE_ISO.test(v)) continue;
      const m = v.match(DATE_XY);
      if (!m) continue;
      if (+m[1] > 12) dmy++;
      if (+m[2] > 12) mdy++;
    }
    return mdy > dmy ? 'MDY' : 'DMY';
  }

  function partsFromValue(v, order) {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v)) {
      return { y: v.getFullYear(), mo: v.getMonth() + 1, d: v.getDate(), h: v.getHours(), mi: v.getMinutes(), s: v.getSeconds(), hasDate: v.getFullYear() > 1900, hasTime: true };
    }
    if (typeof v === 'number') {
      if (typeof XLSX === 'undefined') return null;
      const p = XLSX.SSF.parse_date_code(v);
      if (!p) return null;
      return { y: p.y, mo: p.m, d: p.d, h: p.H, mi: p.M, s: Math.floor(p.S), hasDate: v >= 1, hasTime: v % 1 !== 0 };
    }
    const s = String(v).trim();
    const out = { hasDate: false, hasTime: false, h: 0, mi: 0, s: 0 };
    let rest = s;
    let m = s.match(DATE_ISO);
    if (m) { out.y = +m[1]; out.mo = +m[2]; out.d = +m[3]; out.hasDate = true; rest = s.replace(m[0], ' '); }
    else if ((m = s.match(DATE_XY))) {
      let a = +m[1], b = +m[2], y = +m[3];
      if (y < 100) y += 2000;
      if (order === 'MDY') [a, b] = [b, a];
      out.d = a; out.mo = b; out.y = y; out.hasDate = true; rest = s.replace(m[0], ' ');
    }
    const t = rest.match(TIME);
    if (t) {
      let h = +t[1];
      const ap = (t[4] || '').toLowerCase();
      if (ap === 'p' && h < 12) h += 12;
      if (ap === 'a' && h === 12) h = 0;
      out.h = h; out.mi = +t[2]; out.s = +(t[3] || 0); out.hasTime = true;
    }
    return out.hasDate || out.hasTime ? out : null;
  }

  function toTs(dtVal, dateVal, order) {
    const a = partsFromValue(dtVal, order);
    if (!a) return null;
    let p = a;
    if (!a.hasDate || !a.hasTime) {
      const b = partsFromValue(dateVal, order);
      if (b) {
        p = {
          y: a.hasDate ? a.y : b.y, mo: a.hasDate ? a.mo : b.mo, d: a.hasDate ? a.d : b.d,
          h: a.hasTime ? a.h : b.h, mi: a.hasTime ? a.mi : b.mi, s: a.hasTime ? a.s : b.s,
          hasDate: a.hasDate || b.hasDate, hasTime: a.hasTime || b.hasTime,
        };
      }
    }
    if (!p.hasDate || !p.hasTime) return null;
    if (p.mo < 1 || p.mo > 12 || p.d < 1 || p.d > 31 || p.h > 23 || p.mi > 59) return null;
    return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s || 0);
  }

  /* ---------- sede ---------- */
  Parser.detectSede = (text) => {
    const n = U.norm(text);
    if (!n) return null;
    if (/\bprado\b/.test(n) || n.includes('prado')) return 'prado';
    if (n.includes('boston')) return 'boston';
    if (/\bkids?\b/.test(n) || n.includes('kids')) return 'kids';
    return null;
  };

  /* ---------- API ---------- */
  Parser.analyze = async (file) => {
    const { sheets } = await readRows(file);
    // elegir la hoja con más filas que tenga columna de fecha
    let best = null;
    for (const sh of sheets) {
      if (!sh.rows.length) continue;
      const hi = findHeaderRow(sh.rows);
      const headers = sh.rows[hi].map((h) => (h == null ? '' : String(h).trim()));
      const mapping = detectMapping(headers);
      const score = (mapping.datetime != null ? 100 : 0) + (mapping.empId != null || mapping.name != null ? 50 : 0) + sh.rows.length / 1e6;
      if (!best || score > best.score) best = { sheet: sh.name, headerIdx: hi, headers, mapping, rows: sh.rows.slice(hi + 1), score };
    }
    if (!best) throw new Error('El archivo está vacío.');
    const dtCol = best.mapping.datetime;
    best.dateOrder = guessDateOrder(best.rows.slice(0, 500).map((r) => r[dtCol]).concat(best.rows.slice(0, 500).map((r) => r[best.mapping.date])));
    // sede sugerida
    best.sedeFromName = Parser.detectSede(file.name);
    if (best.mapping.device != null) {
      const counts = {};
      best.rows.slice(0, 2000).forEach((r) => { const s = Parser.detectSede(r[best.mapping.device]); if (s) counts[s] = (counts[s] || 0) + 1; });
      best.sedeFromDevice = Object.keys(counts).length ? counts : null;
    }
    best.fileName = file.name;
    best.fileSize = file.size;
    return best;
  };

  /* Convierte las filas a marcaciones usando el mapeo elegido */
  Parser.build = (an, mapping, sedeChoice, dateOrder, fileId) => {
    const out = [];
    const stats = { total: an.rows.length, ok: 0, noDate: 0, noPerson: 0, failed: 0, noSede: 0 };
    const get = (r, f) => (mapping[f] == null || mapping[f] === '' ? '' : r[mapping[f]]);
    for (const r of an.rows) {
      const ts = toTs(get(r, 'datetime'), get(r, 'date'), dateOrder);
      if (ts == null) { stats.noDate++; continue; }
      const empIdRaw = get(r, 'empId');
      const empId = empIdRaw == null ? '' : String(empIdRaw).trim().replace(/\.0$/, '');
      const name = String(get(r, 'name') || '').trim();
      if (!empId && !name) { stats.noPerson++; continue; }
      const result = U.norm(get(r, 'result'));
      if (result && FAIL_RE.test(result)) { stats.failed++; continue; }
      const device = String(get(r, 'device') || '').trim();
      let sede = sedeChoice;
      if (sedeChoice === 'auto') sede = Parser.detectSede(device) || an.sedeFromName;
      if (!sede) { stats.noSede++; continue; }
      const personKey = empId || U.norm(name);
      out.push({
        id: U.hash(sede + '|' + personKey + '|' + ts),
        sede, empId, name: name || empId, dept: String(get(r, 'dept') || '').trim(),
        ts, device, status: String(get(r, 'status') || '').trim(), file: fileId,
      });
      stats.ok++;
    }
    return { punches: out, stats };
  };

  Parser.preview = (an, mapping, dateOrder, n = 6) => an.rows.slice(0, n).map((r) => {
    const get = (f) => (mapping[f] == null || mapping[f] === '' ? '' : r[mapping[f]]);
    const ts = toTs(get('datetime'), get('date'), dateOrder);
    return { empId: get('empId'), name: get('name'), dept: get('dept'), ts, device: get('device'), result: get('result') };
  });

  Parser.toTs = toTs;
  window.Parser = Parser;
})();
