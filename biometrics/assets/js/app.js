/* Aplicación principal: estado, filtros, vistas e interacción. */
(function () {
  const $ = U.$, $$ = U.$$;
  const S = {
    punches: [], files: [], model: null,
    cfg: loadCfg(),
    f: { sede: 'all', range: '30d', from: null, to: null, dept: '', q: '' },
    view: 'resumen', days: [], persons: [], summary: null,
    sort: {}, page: { asis: 0, personas: 0 },
    pending: [],
  };
  const VIEWS = {
    resumen: ['Resumen', 'Vista general de la asistencia'],
    asistencia: ['Asistencia diaria', 'Entradas, salidas y estado de cada jornada'],
    personas: ['Personas', 'Indicadores individuales del periodo'],
    extras: ['Horas extras', 'Tiempo trabajado fuera del horario'],
    puntualidad: ['Puntualidad', 'Llegadas tarde y horas de ingreso'],
    novedades: ['Novedades', 'Ausencias, marcaciones incompletas y salidas anticipadas'],
    reportes: ['Reportes', 'Descarga informes en PDF, Excel o CSV'],
    cargar: ['Cargar datos', 'Importa las exportaciones de iVMS-4200'],
    config: ['Configuración', 'Horarios por sede y reglas de cálculo'],
  };
  const PAGE = 50;

  function loadCfg() {
    const saved = U.lsGet('asis.cfg', null);
    const d = JSON.parse(JSON.stringify(Engine.DEFAULT_CONFIG));
    if (!saved) return d;
    return { ...d, ...saved, sedes: { ...d.sedes, ...(saved.sedes || {}) } };
  }

  /* ===================== datos ===================== */
  async function reload() {
    S.punches = await Store.all('punches');
    S.files = await Store.all('files');
    recompute();
  }
  function recompute() {
    S.model = Engine.build(S.punches, S.cfg);
    fillDepts();
    applyRange(S.f.range, true);
    $('#dataBadge').textContent = S.punches.length ? `${U.num(S.punches.length)} marcaciones · ${U.num(S.model.people.size)} personas` : 'Sin datos cargados';
    render();
  }
  function fillDepts() {
    const sel = $('#deptSel'), cur = S.f.dept;
    sel.innerHTML = '<option value="">Todas las áreas</option>' + S.model.depts.map((d) => `<option ${d === cur ? 'selected' : ''}>${U.esc(d)}</option>`).join('');
  }

  function applyRange(r, keepCustom) {
    const m = S.model;
    const last = m && m.maxDate ? (m.maxDate < U.todayKey() ? m.maxDate : U.todayKey()) : U.todayKey();
    let from, to = last;
    if (r === 'custom' && keepCustom && S.f.from) return syncDates();
    if (r === '7d') from = U.addDays(last, -6);
    else if (r === '30d') from = U.addDays(last, -29);
    else if (r === 'month') from = last.slice(0, 8) + '01';
    else if (r === 'prev') { const p = U.addDays(last.slice(0, 8) + '01', -1); from = p.slice(0, 8) + '01'; to = p; }
    else { from = (m && m.minDate) || last; }
    S.f.range = r; S.f.from = from; S.f.to = to;
    syncDates();
  }
  function syncDates() {
    $('#fromDate').value = S.f.from || '';
    $('#toDate').value = S.f.to || '';
    $$('#rangeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.range === S.f.range));
  }

  function sedesInScope() { return S.f.sede === 'all' ? U.SEDES.map((s) => s.id).filter((id) => S.model.days.some((d) => d.sede === id)) : [S.f.sede]; }
  /* días laborales (para gráficas de tendencia): excluye fines de semana y festivos sin horario */
  function workDates() { const sedes = sedesInScope(); const ds = datesInRange().filter((k) => sedes.some((s) => Engine.scheduleFor(S.cfg, s, k))); return ds.length ? ds : datesInRange(); }
  function datesInRange() { const out = []; let k = S.f.from; let g = 0; while (k && k <= S.f.to && g++ < 1500) { out.push(k); k = U.addDays(k, 1); } return out; }

  function ctx(extra = {}) {
    const sedes = sedesInScope();
    const fp = S.punches.filter((p) => (S.f.sede === 'all' || p.sede === S.f.sede) && U.dayKey(p.ts) >= S.f.from && U.dayKey(p.ts) <= S.f.to);
    const keys = new Set(S.persons.map((p) => p.person.key));
    const notes = [];
    if (S.f.dept) notes.push('Área: ' + S.f.dept);
    if (S.f.q) notes.push('Búsqueda: "' + S.f.q + '"');
    return {
      days: S.days, persons: S.persons, summary: S.summary, sedes, dates: workDates(),
      punches: fp.filter((p) => keys.has(p.sede + '|' + (p.empId || U.norm(p.name)))),
      from: S.f.from, to: S.f.to, sedeId: S.f.sede,
      scopeLabel: S.f.sede === 'all' ? 'Todas las sedes' : U.sedeName(S.f.sede),
      filterNote: notes.join(' · '), ...extra,
    };
  }

  /* ===================== render ===================== */
  function render() {
    S.days = Engine.filterDays(S.model, S.f);
    S.persons = Engine.byPerson(S.days);
    S.summary = Engine.summarize(S.days);
    const v = S.view;
    if (['resumen', 'asistencia', 'personas', 'extras', 'puntualidad', 'novedades'].includes(v) && !S.punches.length) return renderWelcome(v);
    clearWelcome(v);
    ({ resumen: rResumen, asistencia: rAsistencia, personas: rPersonas, extras: rExtras, puntualidad: rPuntualidad, novedades: rNovedades, reportes: rReportes, cargar: rCargar, config: rConfig })[v]();
  }

  function renderWelcome(v) {
    const sec = $('#view-' + v);
    Array.from(sec.children).forEach((c) => { if (!c.classList.contains('welcome')) c.style.display = 'none'; });
    if (!sec.querySelector('.welcome')) {
      sec.insertAdjacentHTML('afterbegin', `<div class="card welcome"><div class="dz-icon" style="margin:0 auto 14px"><i data-icon="upload"></i></div><h2>Aún no hay registros</h2><p>Carga las exportaciones de iVMS-4200 de cada sede (Excel o CSV) para ver la asistencia, horarios, horas extras y reportes. También puedes explorar con datos de demostración.</p><div class="row gap" style="justify-content:center"><button class="btn primary" data-goto="cargar"><i data-icon="upload"></i>Cargar archivos</button><button class="btn" data-demo><i data-icon="sparkle"></i>Ver demostración</button></div></div>`);
      U.hydrateIcons(sec);
    }
  }
  function clearWelcome(v) {
    const sec = $('#view-' + v);
    const w = sec.querySelector('.welcome');
    if (w) { w.remove(); Array.from(sec.children).forEach((c) => (c.style.display = '')); }
  }

  function kpi(icon, label, value, foot, bar, color) {
    return `<div class="kpi"><div class="kpi-label"><i data-icon="${icon}"></i>${label}</div><div class="kpi-value">${value}</div>${foot ? `<div class="kpi-foot">${foot}</div>` : ''}${bar != null && isFinite(bar) ? `<div class="bar"><span style="width:${Math.max(0, Math.min(100, bar * 100))}%;background:${color || 'var(--accent)'}"></span></div>` : ''}</div>`;
  }
  function setKpis(id, html) { const el = $('#' + id); el.innerHTML = html; U.hydrateIcons(el); }

  function statusCounts(days) {
    const c = { ok: 0, late: 0, inc: 0, abs: 0, off: 0 };
    days.forEach((d) => { if (d.status === 'off' && !d.marks.length) return; c[d.status]++; });
    return c;
  }

  function rResumen() {
    const k = S.summary;
    setKpis('kpis', [
      kpi('users', 'Personas', U.num(k.people), `${U.num(k.jornadas)} jornadas registradas`),
      kpi('target', 'Asistencia', U.pct(k.attendance, 1), `${U.num(k.expected - k.absences)} de ${U.num(k.expected)} días laborales`, k.attendance, 'var(--good)'),
      kpi('alarm', 'Puntualidad', U.pct(k.punctuality, 1), `Entrada promedio ${U.hm(k.avgIn)}`, k.punctuality, 'var(--accent)'),
      kpi('clock', 'Horas trabajadas', U.num(k.worked / 60) + '<small>h</small>', `Promedio ${U.dur(k.avgWorked)} por jornada`),
      kpi('trend', 'Horas extras', U.num(k.overtime / 60, 1) + '<small>h</small>', `${U.num(k.overtimeDays)} jornadas con extras`),
      kpi('alert', 'Tardanzas', U.num(k.lateCount), `${U.dur(k.lateMin)} acumulados`),
      kpi('logout', 'Incompletas', U.num(k.incomplete), 'Falta entrada o salida'),
      kpi('x', 'Ausencias', U.num(k.absences), 'Días laborales sin marcar'),
    ].join(''));
    const sedes = sedesInScope(), dates = workDates();
    Charts.trend('chTrend', S.days, sedes, dates);
    Charts.status('chStatus', statusCounts(S.days));
    Charts.arrival('chArrival', S.days, sedes);
    Charts.heatmap($('#heatmap'), S.days);
    const t = Reports.tables.sedes(S.days, sedes);
    const rows = sedes.map((s, i) => { const r = t.rows[i]; return `<tr><td><span class="row gap"><span class="dot s-${s}"></span><b>${r[0]}</b></span></td>${r.slice(1).map((v, j) => `<td class="num">${[2, 3].includes(j) ? (v === '' ? '—' : U.num(v, 1) + '%') : [6, 7].includes(j) ? U.num(v, 1) + ' h' : typeof v === 'number' ? U.num(v) : v}</td>`).join('')}</tr>`; }).join('');
    $('#tblSedes').innerHTML = `<thead><tr>${t.head.map((h, i) => `<th class="${i ? 'num' : ''}">${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody>`;
  }

  /* ---------- tabla genérica ordenable ---------- */
  function renderTable(id, cols, rows, opts = {}) {
    const el = $('#' + id);
    const st = S.sort[id] || opts.defaultSort || { i: 0, dir: 1 };
    S.sort[id] = st;
    const col = cols[st.i];
    const sorted = rows.slice().sort((a, b) => { const va = col.sort ? col.sort(a) : col.v(a), vb = col.sort ? col.sort(b) : col.v(b); return (va > vb ? 1 : va < vb ? -1 : 0) * st.dir; });
    let shown = sorted, pageKey = opts.page;
    if (pageKey) { const p = Math.min(S.page[pageKey], Math.max(0, Math.ceil(sorted.length / PAGE) - 1)); S.page[pageKey] = p; shown = sorted.slice(p * PAGE, (p + 1) * PAGE); }
    el.innerHTML = `<thead><tr>${cols.map((c, i) => `<th data-i="${i}" class="${c.num ? 'num' : ''}">${c.h}${st.i === i ? `<span class="arrow">${st.dir > 0 ? '▲' : '▼'}</span>` : ''}</th>`).join('')}</tr></thead>` +
      `<tbody>${shown.length ? shown.map((r, ri) => `<tr data-r="${ri}">${cols.map((c) => `<td class="${c.num ? 'num' : ''}">${c.html ? c.html(r) : U.esc(c.v(r))}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${cols.length}" class="empty">No hay registros con los filtros actuales</td></tr>`}</tbody>`;
    el.querySelectorAll('th').forEach((th) => th.onclick = () => { const i = +th.dataset.i; S.sort[id] = { i, dir: st.i === i ? -st.dir : (cols[i].num ? -1 : 1) }; renderTable(id, cols, rows, opts); });
    if (opts.onClick) el.querySelectorAll('tbody tr[data-r]').forEach((tr) => tr.onclick = () => opts.onClick(shown[+tr.dataset.r]));
    if (pageKey) pager(opts.pagerId, sorted.length, pageKey, () => renderTable(id, cols, rows, opts));
  }
  function pager(id, total, key, rerender) {
    const el = $('#' + id), pages = Math.ceil(total / PAGE), p = S.page[key];
    if (pages <= 1) { el.innerHTML = `<span>${U.num(total)} registros</span>`; return; }
    el.innerHTML = `<span>${U.num(p * PAGE + 1)}–${U.num(Math.min(total, (p + 1) * PAGE))} de ${U.num(total)}</span><div class="row gap"><button class="btn sm" ${p ? '' : 'disabled'} data-p="-1">Anterior</button><span>Página ${p + 1} de ${pages}</span><button class="btn sm" ${p < pages - 1 ? '' : 'disabled'} data-p="1">Siguiente</button></div>`;
    el.querySelectorAll('button').forEach((b) => b.onclick = () => { S.page[key] += +b.dataset.p; rerender(); });
  }

  const personCell = (per) => `<div class="person"><span class="avatar" style="background:${U.avatarColor(per.key)}">${U.esc(U.initials(per.name))}</span><div><div>${U.esc(per.name)}</div><div class="muted small">${U.esc(per.empId || '')}${per.dept ? ' · ' + U.esc(per.dept) : ''}</div></div></div>`;
  const sedeCell = (s) => `<span class="row gap" style="display:inline-flex;margin-right:8px"><span class="dot s-${s}"></span>${U.sedeShort(s)}</span>`;
  const chip = (st) => `<span class="chip ${Engine.STATUS[st].cls}">${Engine.STATUS[st].label}</span>`;
  const minutes = (m) => (m ? Math.round(m) + ' min' : '—');
  const pctCell = (v, color) => (isFinite(v) ? `<span class="minibar"><span style="width:${v * 100}%;background:${color}"></span></span>${U.pct(v)}` : '—');

  const DAY_COLS = [
    { h: 'Fecha', v: (d) => U.fmtDate(d.date), sort: (d) => d.date, html: (d) => `<b>${U.fmtDate(d.date)}</b> <span class="muted small">${U.WEEKDAYS[d.wd]}</span>` },
    { h: 'Persona', v: (d) => d.person.name, html: (d) => personCell(d.person) },
    { h: 'Sede', v: (d) => d.sede, html: (d) => sedeCell(d.sede) },
    { h: 'Entrada', v: (d) => U.timeOf(d.in), sort: (d) => d.inMin ?? 9999 },
    { h: 'Salida', v: (d) => U.timeOf(d.out), sort: (d) => d.outMin ?? -1 },
    { h: 'Horario', v: (d) => (d.scheduled ? `${U.hm(d.schStart)}–${U.hm(d.schEnd)}` : '—') },
    { h: 'Trabajado', num: true, v: (d) => (d.worked ? U.dur(d.worked) : '—'), sort: (d) => d.worked },
    { h: 'Tardanza', num: true, v: (d) => minutes(d.marks.length ? d.late : 0), sort: (d) => d.late },
    { h: 'Extras', num: true, v: (d) => (d.overtime ? U.dur(d.overtime) : '—'), sort: (d) => d.overtime },
    { h: 'Marc.', num: true, v: (d) => d.marks.length, sort: (d) => d.marks.length },
    { h: 'Estado', v: (d) => d.status, html: (d) => chip(d.status) },
  ];

  function rAsistencia() {
    const sel = $('#asisStatus');
    if (sel.options.length < 2) sel.innerHTML += Object.entries(Engine.STATUS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
    const st = sel.value;
    const rows = S.days.filter((d) => (d.marks.length || d.status === 'abs') && (!st || d.status === st));
    $('#asisCount').textContent = `${U.num(rows.length)} jornadas · ${U.fmtRange(S.f.from, S.f.to)}`;
    renderTable('tblAsis', DAY_COLS, rows, { page: 'asis', pagerId: 'pgAsis', defaultSort: { i: 0, dir: -1 }, onClick: (d) => openPerson(d.person.key) });
  }

  function rPersonas() {
    const cols = [
      { h: 'Persona', v: (r) => r.person.name, html: (r) => personCell(r.person) },
      { h: 'Sede', v: (r) => r.person.sede, html: (r) => sedeCell(r.person.sede) },
      { h: 'Días', num: true, v: (r) => `${r.jornadas}/${r.expected}`, sort: (r) => r.jornadas },
      { h: 'Asistencia', num: true, v: (r) => r.attendance, sort: (r) => (isFinite(r.attendance) ? r.attendance : -1), html: (r) => pctCell(r.attendance, 'var(--good)') },
      { h: 'Puntualidad', num: true, v: (r) => r.punctuality, sort: (r) => (isFinite(r.punctuality) ? r.punctuality : -1), html: (r) => pctCell(r.punctuality, 'var(--accent)') },
      { h: 'Entrada prom.', num: true, v: (r) => U.hm(r.avgIn), sort: (r) => r.avgIn ?? 9999 },
      { h: 'Salida prom.', num: true, v: (r) => U.hm(r.avgOut), sort: (r) => r.avgOut ?? -1 },
      { h: 'Trabajado', num: true, v: (r) => U.dur(r.worked), sort: (r) => r.worked },
      { h: 'Extras', num: true, v: (r) => (r.overtime ? U.dur(r.overtime) : '—'), sort: (r) => r.overtime },
      { h: 'Tardanzas', num: true, v: (r) => r.lateCount || '—', sort: (r) => r.lateCount },
      { h: 'Ausencias', num: true, v: (r) => r.absences || '—', sort: (r) => r.absences },
      { h: 'Incompl.', num: true, v: (r) => r.incomplete || '—', sort: (r) => r.incomplete },
    ];
    renderTable('tblPersonas', cols, S.persons, { page: 'personas', pagerId: 'pgPersonas', defaultSort: { i: 0, dir: 1 }, onClick: (r) => openPerson(r.person.key) });
  }

  function rExtras() {
    const k = S.summary;
    const withOt = S.persons.filter((p) => p.overtime > 0);
    const top = withOt.slice().sort((a, b) => b.overtime - a.overtime)[0];
    setKpis('kpisExtras', [
      kpi('clock', 'Horas extras', U.num(k.overtime / 60, 1) + '<small>h</small>', `${U.num(k.overtimeDays)} jornadas`),
      kpi('users', 'Personas con extras', U.num(withOt.length), `de ${U.num(k.people)} con registros`),
      kpi('trend', 'Promedio por jornada', U.dur(k.overtimeDays ? k.overtime / k.overtimeDays : 0), 'En jornadas con extras'),
      kpi('person', 'Mayor acumulado', top ? U.dur(top.overtime) : '—', top ? U.esc(top.person.name) : ''),
    ].join(''));
    Charts.extrasWeek('chExtrasWeek', S.days, sedesInScope());
    Charts.extrasDept('chExtrasDept', S.days);
    const max = top ? top.overtime : 1;
    renderTable('tblExtras', [
      { h: 'Persona', v: (r) => r.person.name, html: (r) => personCell(r.person) },
      { h: 'Sede', v: (r) => r.person.sede, html: (r) => sedeCell(r.person.sede) },
      { h: 'Días con extras', num: true, v: (r) => r.overtimeDays },
      { h: 'Horas extras', num: true, v: (r) => r.overtime, html: (r) => `<span class="minibar"><span style="width:${(r.overtime / max) * 100}%"></span></span>${U.dur(r.overtime)}` },
      { h: 'Prom. por día', num: true, v: (r) => U.dur(r.overtime / r.overtimeDays), sort: (r) => r.overtime / r.overtimeDays },
      { h: 'Salida prom.', num: true, v: (r) => U.hm(r.avgOut), sort: (r) => r.avgOut ?? -1 },
      { h: 'Trabajado total', num: true, v: (r) => U.dur(r.worked), sort: (r) => r.worked },
    ], withOt, { defaultSort: { i: 3, dir: -1 }, onClick: (r) => openPerson(r.person.key) });
  }

  function rPuntualidad() {
    const k = S.summary;
    const late = S.persons.filter((p) => p.lateCount > 0);
    setKpis('kpisPunt', [
      kpi('target', 'Puntualidad', U.pct(k.punctuality, 1), 'Jornadas sin tardanza', k.punctuality),
      kpi('alarm', 'Tardanzas', U.num(k.lateCount), `${U.num(late.length)} personas`),
      kpi('clock', 'Tiempo perdido', U.dur(k.lateMin), `Promedio ${U.num(k.lateCount ? k.lateMin / k.lateCount : 0)} min por tardanza`),
      kpi('calendar', 'Entrada promedio', U.hm(k.avgIn), `Salida promedio ${U.hm(k.avgOut)}`),
    ].join(''));
    const sedes = sedesInScope();
    Charts.avgArrival('chAvgArrival', S.days, sedes, workDates());
    Charts.lateWeekday('chLateWeekday', S.days, sedes);
    const max = Math.max(1, ...late.map((p) => p.lateCount));
    renderTable('tblTardanzas', [
      { h: 'Persona', v: (r) => r.person.name, html: (r) => personCell(r.person) },
      { h: 'Sede', v: (r) => r.person.sede, html: (r) => sedeCell(r.person.sede) },
      { h: 'Tardanzas', num: true, v: (r) => r.lateCount, html: (r) => `<span class="minibar"><span style="width:${(r.lateCount / max) * 100}%;background:var(--warn)"></span></span>${r.lateCount}` },
      { h: 'Min. acumulados', num: true, v: (r) => Math.round(r.lateMin) },
      { h: 'Prom. por tardanza', num: true, v: (r) => Math.round(r.lateMin / r.lateCount) + ' min', sort: (r) => r.lateMin / r.lateCount },
      { h: 'Puntualidad', num: true, v: (r) => r.punctuality, html: (r) => pctCell(r.punctuality, 'var(--accent)') },
      { h: 'Entrada prom.', num: true, v: (r) => U.hm(r.avgIn), sort: (r) => r.avgIn ?? 9999 },
    ], late, { defaultSort: { i: 2, dir: -1 }, onClick: (r) => openPerson(r.person.key) });
  }

  function rNovedades() {
    const base = [DAY_COLS[0], DAY_COLS[1], DAY_COLS[2]];
    renderTable('tblIncompletas', [...base, { h: 'Única marcación', v: (d) => U.timeOf(d.in), sort: (d) => d.inMin }], S.days.filter((d) => d.status === 'inc'), { defaultSort: { i: 0, dir: -1 }, onClick: (d) => openPerson(d.person.key) });
    renderTable('tblAusencias', base, S.days.filter((d) => d.status === 'abs'), { defaultSort: { i: 0, dir: -1 }, onClick: (d) => openPerson(d.person.key) });
    renderTable('tblSalidas', [...base, DAY_COLS[3], DAY_COLS[4], DAY_COLS[5], { h: 'Antes de hora', num: true, v: (d) => minutes(d.early), sort: (d) => d.early }], S.days.filter((d) => d.early > 0), { defaultSort: { i: 0, dir: -1 }, onClick: (d) => openPerson(d.person.key) });
  }

  /* ---------- reportes ---------- */
  const REPORTS = [
    { icon: 'file', t: 'Informe general', d: 'Indicadores, gráficas de tendencia, comparativo por sede, resumen por persona y rankings. Ideal para dirección.', pdf: 'general', xls: 'completo' },
    { icon: 'clock', t: 'Horas extras', d: 'Horas extras por persona, por semana y por área, con el detalle de cada jornada para liquidación.', pdf: 'extras', xls: 'extras' },
    { icon: 'alarm', t: 'Puntualidad y tardanzas', d: 'Ranking de tardanzas, minutos acumulados, hora promedio de llegada y detalle por día.', pdf: 'tardanzas', xls: 'tardanzas' },
    { icon: 'alert', t: 'Novedades', d: 'Ausencias, marcaciones incompletas y salidas anticipadas para revisión y justificación.', pdf: 'novedades', xls: 'novedades' },
    { icon: 'calendar', t: 'Asistencia detallada', d: 'Una fila por persona y día: entrada, salida, horas trabajadas, tardanza, extras y estado. Útil para nómina.', xls: 'detalle', csv: 'detalle' },
    { icon: 'users', t: 'Reportes individuales', d: 'Un PDF con una sección por persona: indicadores, gráfica de entradas y salidas y detalle diario.', pdf: 'individual', xls: 'personas' },
    { icon: 'fingerprint', t: 'Marcaciones originales', d: 'Todas las marcaciones tal como vienen del equipo, con fecha, hora, dispositivo y estado.', xls: 'marcaciones', csv: 'marcaciones' },
  ];
  function rReportes() {
    const el = $('#reportGrid');
    const c = ctx();
    el.innerHTML = REPORTS.map((r, i) => `<div class="card report"><div class="r-icon"><i data-icon="${r.icon}"></i></div><h3>${r.t}</h3><p>${r.d}</p><div class="row">${r.pdf ? `<button class="btn primary sm" data-rp="${i}"><i data-icon="download"></i>PDF</button>` : ''}${r.xls ? `<button class="btn sm" data-rx="${i}"><i data-icon="sheet"></i>Excel</button>` : ''}${r.csv ? `<button class="btn sm" data-rc="${i}">CSV</button>` : ''}</div></div>`).join('') +
      `<div class="card report"><div class="r-icon"><i data-icon="target"></i></div><h3>Alcance actual</h3><p><b>${U.esc(c.scopeLabel)}</b><br>${U.fmtRange(c.from, c.to)}<br>${U.num(c.persons.length)} personas · ${U.num(c.summary.jornadas)} jornadas${c.filterNote ? '<br>' + U.esc(c.filterNote) : ''}</p></div>`;
    U.hydrateIcons(el);
    el.querySelectorAll('[data-rp]').forEach((b) => b.onclick = () => guard() && Reports.pdf(ctx(), REPORTS[b.dataset.rp].pdf));
    el.querySelectorAll('[data-rx]').forEach((b) => b.onclick = () => guard() && Reports.excel(ctx(), REPORTS[b.dataset.rx].xls));
    el.querySelectorAll('[data-rc]').forEach((b) => b.onclick = () => guard() && exportCsv(REPORTS[b.dataset.rc].csv));
  }
  function guard() { if (!S.punches.length) { U.toast('Primero carga datos.'); return false; } return true; }
  function exportCsv(which) {
    const c = ctx();
    const t = which === 'marcaciones' ? Reports.tables.marcaciones(c.punches) : Reports.tables.detalle(c.days.filter((d) => d.status !== 'off' || d.marks.length));
    Reports.csv(t, Reports.fileName(c, which));
  }

  /* ---------- persona ---------- */
  let dwKey = null;
  function openPerson(key) {
    dwKey = key;
    const per = S.model.people.get(key);
    const days = Engine.filterDays(S.model, { ...S.f, dept: '', q: '' }).filter((d) => d.person.key === key);
    const s = Engine.summarize(days);
    $('#dwSede').innerHTML = `<span class="row gap"><span class="dot s-${per.sede}"></span>${U.sedeName(per.sede)}</span>`;
    $('#dwName').textContent = per.name;
    $('#dwMeta').textContent = `ID ${per.empId || '—'}${per.dept ? ' · ' + per.dept : ''} · ${U.fmtRange(S.f.from, S.f.to)}`;
    setKpis('dwKpis', [
      kpi('calendar', 'Días asistidos', `${s.jornadas}<small>/${s.expected}</small>`),
      kpi('target', 'Asistencia', U.pct(s.attendance)),
      kpi('alarm', 'Puntualidad', U.pct(s.punctuality)),
      kpi('clock', 'Trabajado', U.num(s.worked / 60, 1) + '<small>h</small>'),
      kpi('trend', 'Extras', U.num(s.overtime / 60, 1) + '<small>h</small>'),
      kpi('alert', 'Tardanzas', s.lateCount),
      kpi('x', 'Ausencias', s.absences),
      kpi('logout', 'Incompletas', s.incomplete),
    ].join(''));
    // calendario por mes
    const byDate = new Map(days.map((d) => [d.date, d]));
    const months = Array.from(new Set(datesInRange().map(U.monthKey)));
    $('#dwCal').innerHTML = months.map((mk) => {
      const first = mk + '-01';
      const offset = (U.weekday(first) + 6) % 7;
      let cells = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((w) => `<div class="wd">${w}</div>`).join('') + '<div class="cal-day blank"></div>'.repeat(offset);
      for (let k = first; k.startsWith(mk); k = U.addDays(k, 1)) {
        const d = byDate.get(k);
        const out = k < S.f.from || k > S.f.to;
        const cls = d ? (d.status === 'off' ? 'off' : Engine.STATUS[d.status].cls) : 'off';
        const tip = d ? `${U.fmtDate(k, 'long')} · ${Engine.STATUS[d.status].label}${d.marks.length ? ` · ${U.timeOf(d.in)}–${U.timeOf(d.out)}` : ''}${d.overtime ? ' · extras ' + U.dur(d.overtime) : ''}` : U.fmtDate(k, 'long');
        cells += `<div class="cal-day ${out ? 'blank' : cls}" data-tip="${U.esc(tip)}"><b>${+k.slice(8)}</b>${d && d.marks.length && !out ? `<span>${U.timeOf(d.in)}${d.out ? '<br>' + U.timeOf(d.out) : ''}</span>` : ''}</div>`;
      }
      return `<div class="cal-month"><h4>${U.MONTHS[+mk.slice(5) - 1]} ${mk.slice(0, 4)}</h4><div class="cal-grid">${cells}</div></div>`;
    }).join('');
    const list = days.filter((d) => d.marks.length || d.status === 'abs').sort((a, b) => (a.date < b.date ? 1 : -1));
    $('#dwTable').innerHTML = `<thead><tr><th>Fecha</th><th>Entrada</th><th>Salida</th><th>Marcaciones</th><th class="num">Trabajado</th><th class="num">Tardanza</th><th class="num">Extras</th><th>Estado</th></tr></thead><tbody>${list.map((d) => `<tr><td><b>${U.fmtDate(d.date)}</b> <span class="muted small">${U.WEEKDAYS[d.wd]}</span></td><td>${U.timeOf(d.in)}</td><td>${U.timeOf(d.out)}</td><td class="muted small">${d.marks.map(U.timeOf).join(' · ') || '—'}</td><td class="num">${d.worked ? U.dur(d.worked) : '—'}</td><td class="num">${minutes(d.marks.length ? d.late : 0)}</td><td class="num">${d.overtime ? U.dur(d.overtime) : '—'}</td><td>${chip(d.status)}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">Sin jornadas en el periodo</td></tr>'}</tbody>`;
    $('#drawer').classList.add('on'); $('#drawerBackdrop').classList.add('on'); $('#drawer').setAttribute('aria-hidden', 'false');
    setTimeout(() => Charts.person('chPerson', days), 60);
    S._dw = { per, days, s };
  }
  function closePerson() { $('#drawer').classList.remove('on'); $('#drawerBackdrop').classList.remove('on'); $('#drawer').setAttribute('aria-hidden', 'true'); dwKey = null; }
  function personCtx() {
    const { per, days, s } = S._dw;
    return ctx({ days, persons: [{ person: per, ...s, days }], summary: s, sedeId: per.sede, sedes: [per.sede], scopeLabel: per.name, punches: S.punches.filter((p) => p.sede + '|' + (p.empId || U.norm(p.name)) === per.key && U.dayKey(p.ts) >= S.f.from && U.dayKey(p.ts) <= S.f.to), filterNote: '' });
  }

  /* ---------- carga ---------- */
  function rCargar() {
    const bySede = {};
    S.punches.forEach((p) => (bySede[p.sede] = (bySede[p.sede] || 0) + 1));
    $('#filesSummary').textContent = S.punches.length ? `${U.num(S.punches.length)} marcaciones · ` + U.SEDES.map((s) => `${U.sedeShort(s.id)}: ${U.num(bySede[s.id] || 0)}`).join(' · ') : 'Todavía no has cargado archivos';
    const files = S.files.slice().sort((a, b) => b.importedAt - a.importedAt);
    $('#tblFiles').innerHTML = files.length ? `<thead><tr><th>Archivo</th><th>Sede</th><th>Periodo</th><th class="num">Nuevas</th><th class="num">Repetidas</th><th class="num">Descartadas</th><th>Cargado</th><th></th></tr></thead><tbody>${files.map((f) => `<tr><td><b>${U.esc(f.name)}</b></td><td>${f.sedes.map(sedeCell).join(' ')}</td><td>${f.from ? U.fmtRange(f.from, f.to) : '—'}</td><td class="num">${U.num(f.added)}</td><td class="num">${U.num(f.duplicates)}</td><td class="num">${U.num(f.skipped || 0)}</td><td class="muted small">${new Date(f.importedAt).toLocaleString('es-CO')}</td><td><button class="btn ghost sm danger" data-del="${f.id}"><i data-icon="trash"></i></button></td></tr>`).join('')}</tbody>` : '<tbody><tr><td class="empty">Sin archivos</td></tr></tbody>';
    U.hydrateIcons($('#tblFiles'));
    $$('#tblFiles [data-del]').forEach((b) => b.onclick = async () => {
      if (!confirm('¿Eliminar este archivo y sus marcaciones?')) return;
      await Store.removeFile(b.dataset.del); await reload(); U.toast('Archivo eliminado');
    });
    renderPending();
  }

  async function handleFiles(list) {
    for (const file of list) {
      try {
        const an = await Parser.analyze(file);
        const id = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        let sede = an.sedeFromName || '';
        if (!sede && an.sedeFromDevice) sede = Object.keys(an.sedeFromDevice).length > 1 ? 'auto' : Object.keys(an.sedeFromDevice)[0];
        S.pending.push({ id, an, mapping: { ...an.mapping }, sede, dateOrder: an.dateOrder });
      } catch (e) { console.error(e); U.toast(`${file.name}: ${e.message}`, 'err'); }
    }
    if (S.view !== 'cargar') go('cargar'); else renderPending();
  }

  function renderPending() {
    const el = $('#pending');
    el.innerHTML = S.pending.map((p) => {
      const opts = (sel) => `<option value="">— Ninguna —</option>` + p.an.headers.map((h, i) => `<option value="${i}" ${String(sel) === String(i) ? 'selected' : ''}>${U.esc(h || 'Columna ' + (i + 1))}</option>`).join('');
      const prev = Parser.preview(p.an, p.mapping, p.dateOrder);
      const missing = p.mapping.datetime == null || (p.mapping.empId == null && p.mapping.name == null);
      return `<div class="pending" data-pid="${p.id}">
        <div class="pending-head"><div><b>${U.esc(p.an.fileName)}</b><div class="muted small">${U.num(p.an.rows.length)} filas · hoja "${U.esc(p.an.sheet)}"</div></div>
        <div class="row gap wrap"><select data-k="sede"><option value="">Elige la sede…</option>${p.an.mapping.device != null ? `<option value="auto" ${p.sede === 'auto' ? 'selected' : ''}>Según dispositivo</option>` : ''}${U.SEDES.map((s) => `<option value="${s.id}" ${p.sede === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}</select>
        <select data-k="dateOrder" title="Formato de fecha"><option value="DMY" ${p.dateOrder === 'DMY' ? 'selected' : ''}>día/mes/año</option><option value="MDY" ${p.dateOrder === 'MDY' ? 'selected' : ''}>mes/día/año</option></select>
        <button class="btn ghost sm" data-cancel>Descartar</button><button class="btn primary sm" data-import ${missing ? 'disabled' : ''}><i data-icon="check"></i>Importar</button></div></div>
        ${missing ? '<div class="note">No se identificaron las columnas de fecha/hora o de persona. Selecciónalas abajo.</div>' : ''}
        <details ${missing ? 'open' : ''}><summary class="muted small" style="cursor:pointer;margin-bottom:10px">Columnas detectadas (ajusta si es necesario)</summary>
        <div class="map-grid">${Object.entries(Parser.FIELDS).map(([k, f]) => `<label>${f.label}<select data-map="${k}">${opts(p.mapping[k])}</select></label>`).join('')}</div></details>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>ID</th><th>Nombre</th><th>Área</th><th>Fecha y hora interpretada</th><th>Dispositivo</th><th>Evento</th></tr></thead><tbody>${prev.map((r) => `<tr><td>${U.esc(r.empId)}</td><td>${U.esc(r.name)}</td><td>${U.esc(r.dept)}</td><td>${r.ts ? `<b>${U.fmtDate(U.dayKey(r.ts))} ${U.timeOf(r.ts)}</b>` : '<span class="chip abs">No reconocida</span>'}</td><td>${U.esc(r.device)}</td><td>${U.esc(r.result)}</td></tr>`).join('')}</tbody></table></div>
      </div>`;
    }).join('');
    U.hydrateIcons(el);
    el.querySelectorAll('.pending').forEach((card) => {
      const p = S.pending.find((x) => x.id === card.dataset.pid);
      card.querySelectorAll('[data-map]').forEach((s) => s.onchange = () => { p.mapping[s.dataset.map] = s.value === '' ? null : +s.value; renderPending(); });
      card.querySelector('[data-k=sede]').onchange = (e) => (p.sede = e.target.value);
      card.querySelector('[data-k=dateOrder]').onchange = (e) => { p.dateOrder = e.target.value; renderPending(); };
      card.querySelector('[data-cancel]').onclick = () => { S.pending = S.pending.filter((x) => x !== p); renderPending(); };
      card.querySelector('[data-import]').onclick = () => importPending(p);
    });
  }

  async function importPending(p) {
    if (!p.sede) return U.toast('Elige la sede de este archivo antes de importar.', 'err');
    U.loading(true, 'Importando marcaciones…');
    await U.nextFrame();
    try {
      const { punches, stats } = Parser.build(p.an, p.mapping, p.sede, p.dateOrder, p.id);
      if (!punches.length) { U.toast('No se encontraron marcaciones válidas. Revisa las columnas seleccionadas.', 'err'); return; }
      const dates = punches.map((x) => U.dayKey(x.ts)).sort();
      const meta = { id: p.id, name: p.an.fileName, importedAt: Date.now(), sedes: Array.from(new Set(punches.map((x) => x.sede))), from: dates[0], to: dates[dates.length - 1], rows: stats.total, skipped: stats.total - stats.ok };
      const added = await Store.addPunches(punches, meta);
      S.pending = S.pending.filter((x) => x !== p);
      const skippedTxt = [stats.failed && `${stats.failed} eventos fallidos`, stats.noDate && `${stats.noDate} sin fecha`, stats.noPerson && `${stats.noPerson} sin persona`, stats.noSede && `${stats.noSede} sin sede`].filter(Boolean).join(', ');
      U.toast(`${U.num(added)} marcaciones nuevas importadas${meta.duplicates ? ` · ${U.num(meta.duplicates)} repetidas` : ''}${skippedTxt ? ` · descartadas: ${skippedTxt}` : ''}`);
      S.f.range = 'all';
      await reload();
    } catch (e) { console.error(e); U.toast('Error al importar: ' + e.message, 'err'); } finally { U.loading(false); }
  }

  async function loadDemo() {
    if (S.punches.length && !confirm('Se agregarán datos de demostración a los existentes. ¿Continuar?')) return;
    U.loading(true, 'Generando datos de demostración…');
    await U.nextFrame();
    const punches = Demo.generate(S.cfg);
    const dates = punches.map((x) => U.dayKey(x.ts)).sort();
    await Store.addPunches(punches, { id: 'demo', name: 'Datos de demostración', importedAt: Date.now(), sedes: ['prado', 'boston', 'kids'], from: dates[0], to: dates[dates.length - 1], rows: punches.length, skipped: 0 });
    S.f.range = '30d';
    await reload();
    U.loading(false);
    U.toast('Datos de demostración cargados. Puedes borrarlos desde “Cargar datos”.');
    go('resumen');
  }

  /* ---------- configuración ---------- */
  function rConfig() {
    const c = S.cfg;
    $('#cfgSedes').innerHTML = U.SEDES.map((s) => {
      const sc = c.sedes[s.id];
      return `<div class="card" data-sede="${s.id}"><div class="cfg-sede-title"><span class="dot s-${s.id}"></span><h3>${s.name}</h3></div>
        <div class="form">
          <label>Hora de entrada<input type="time" data-f="start" value="${sc.start}"></label>
          <label>Hora de salida<input type="time" data-f="end" value="${sc.end}"></label>
          <label class="full">Días laborales<div class="days">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<label><input type="checkbox" data-day="${d}" ${sc.days.includes(d) ? 'checked' : ''}><span>${U.WEEKDAYS[d]}</span></label>`).join('')}</div></label>
          <label class="switch full"><input type="checkbox" data-f="satOn" ${sc.satOn ? 'checked' : ''}>Horario especial los sábados</label>
          <label>Sábado entrada<input type="time" data-f="satStart" value="${sc.satStart}"></label>
          <label>Sábado salida<input type="time" data-f="satEnd" value="${sc.satEnd}"></label>
        </div></div>`;
    }).join('');
    const num = (k, label, hint) => `<label>${label}<input type="number" min="0" data-g="${k}" value="${c[k]}"><span class="hint">${hint}</span></label>`;
    $('#cfgRules').innerHTML = num('tolerance', 'Tolerancia de entrada (min)', 'Minutos de gracia antes de contar tardanza') +
      num('earlyTolerance', 'Tolerancia de salida (min)', 'Antes de marcar salida anticipada') +
      num('lunch', 'Almuerzo a descontar (min)', 'Se resta de las horas trabajadas') +
      num('lunchAfter', 'Descontar almuerzo si la jornada supera (min)', 'Ej. 300 = 5 horas') +
      num('overtimeMin', 'Mínimo para horas extras (min)', 'Extras por debajo de este valor no cuentan') +
      num('dedup', 'Unir marcaciones repetidas (min)', 'Doble huella en pocos minutos = una sola') +
      `<label class="switch full"><input type="checkbox" data-g="earlyAsOvertime" ${c.earlyAsOvertime ? 'checked' : ''}>Contar la llegada antes de la hora de entrada como hora extra</label>` +
      `<label class="switch full"><input type="checkbox" data-g="countAbsences" ${c.countAbsences ? 'checked' : ''}>Calcular ausencias (días laborales sin marcación)</label>`;
    $('#cfgHolidays').value = c.holidays.join('\n');
  }
  function saveConfig() {
    const c = S.cfg;
    $$('#cfgSedes [data-sede]').forEach((card) => {
      const sc = c.sedes[card.dataset.sede];
      card.querySelectorAll('[data-f]').forEach((i) => (sc[i.dataset.f] = i.type === 'checkbox' ? i.checked : i.value));
      sc.days = $$('[data-day]', card).filter((i) => i.checked).map((i) => +i.dataset.day);
    });
    $$('#cfgRules [data-g]').forEach((i) => (c[i.dataset.g] = i.type === 'checkbox' ? i.checked : Math.max(0, +i.value || 0)));
    c.holidays = $('#cfgHolidays').value.split(/[\s,;]+/).map((x) => x.trim()).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort();
    U.lsSet('asis.cfg', c);
    recompute();
    U.toast('Configuración guardada. Indicadores recalculados.');
  }
  // Festivos de Colombia (Ley Emiliani) para un año
  function coHolidays(y) {
    const k = (m, d) => `${y}-${U.pad(m)}-${U.pad(d)}`;
    const nextMon = (key) => { const wd = U.weekday(key); return wd === 1 ? key : U.addDays(key, (8 - wd) % 7); };
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), hh = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), kk = c % 4, l = (32 + 2 * e + 2 * i - hh - kk) % 7, m = Math.floor((a + 11 * hh + 22 * l) / 451);
    const em = Math.floor((hh + l - 7 * m + 114) / 31), ed = ((hh + l - 7 * m + 114) % 31) + 1;
    const easter = k(em, ed);
    return [k(1, 1), nextMon(k(1, 6)), nextMon(k(3, 19)), U.addDays(easter, -3), U.addDays(easter, -2), k(5, 1), nextMon(U.addDays(easter, 43)), nextMon(U.addDays(easter, 64)), nextMon(U.addDays(easter, 71)), nextMon(k(6, 29)), k(7, 20), k(8, 7), nextMon(k(8, 15)), nextMon(k(10, 12)), nextMon(k(11, 1)), nextMon(k(11, 11)), k(12, 8), k(12, 25)];
  }

  /* ===================== navegación y eventos ===================== */
  function go(v) {
    S.view = v;
    $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.view === v));
    $$('.view').forEach((s) => s.classList.toggle('active', s.id === 'view-' + v));
    $('#viewTitle').textContent = VIEWS[v][0];
    $('#viewSub').textContent = VIEWS[v][1];
    $('#filters').style.display = ['cargar', 'config'].includes(v) ? 'none' : '';
    $('#sidebar').classList.remove('on');
    U.lsSet('asis.view', v);
    render();
    window.scrollTo(0, 0);
  }

  function bind() {
    $$('#nav a').forEach((a) => a.onclick = () => go(a.dataset.view));
    $('#menuBtn').onclick = () => $('#sidebar').classList.toggle('on');
    $$('#sedeSeg button').forEach((b) => b.onclick = () => { S.f.sede = b.dataset.sede; $$('#sedeSeg button').forEach((x) => x.classList.toggle('on', x === b)); S.page.asis = S.page.personas = 0; render(); });
    $$('#rangeSeg button').forEach((b) => b.onclick = () => { applyRange(b.dataset.range); render(); });
    const onDate = () => { S.f.from = $('#fromDate').value; S.f.to = $('#toDate').value; if (S.f.from > S.f.to) [S.f.from, S.f.to] = [S.f.to, S.f.from]; S.f.range = 'custom'; syncDates(); render(); };
    $('#fromDate').onchange = onDate; $('#toDate').onchange = onDate;
    $('#deptSel').onchange = (e) => { S.f.dept = e.target.value; render(); };
    $('#personSearch').oninput = U.debounce((e) => { S.f.q = e.target.value; S.page.asis = S.page.personas = 0; render(); }, 200);
    $('#asisStatus').onchange = () => { S.page.asis = 0; rAsistencia(); };

    $('#themeBtn').onclick = () => {
      const root = document.documentElement;
      const dark = root.getAttribute('data-theme') ? root.getAttribute('data-theme') === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', dark ? 'light' : 'dark');
      try { localStorage.setItem('asis.theme', dark ? 'light' : 'dark'); } catch (e) { /* */ }
      render();
      if (dwKey) Charts.person('chPerson', S._dw.days);
    };

    $('#quickPdf').onclick = () => guard() && Reports.pdf(ctx(), 'general');
    $('#quickExcel').onclick = () => guard() && Reports.excel(ctx(), 'completo');
    document.addEventListener('click', (e) => {
      const ex = e.target.closest('[data-export]');
      if (ex && guard()) {
        const c = ctx(), w = ex.dataset.export, T = Reports.tables;
        const map = {
          asistencia: () => T.detalle(S.days.filter((d) => d.marks.length || d.status === 'abs').filter((d) => !$('#asisStatus').value || d.status === $('#asisStatus').value)),
          personas: () => T.personas(S.persons), extras: () => T.extras(S.persons), tardanzas: () => T.tardanzas(S.persons),
          incompletas: () => T.novedad(S.days.filter((d) => d.status === 'inc')), ausencias: () => T.novedad(S.days.filter((d) => d.status === 'abs')), salidas: () => T.novedad(S.days.filter((d) => d.early > 0)),
        };
        const t = map[w]();
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([t.head, ...t.rows]);
        ws['!cols'] = t.head.map((h) => ({ wch: Math.max(12, h.length + 2) }));
        XLSX.utils.book_append_sheet(wb, ws, w.slice(0, 30));
        XLSX.writeFile(wb, Reports.fileName(c, w) + '.xlsx');
      }
      const g = e.target.closest('[data-goto]'); if (g) go(g.dataset.goto);
      if (e.target.closest('[data-demo]')) loadDemo();
    });

    // carga
    const dz = $('#dropzone');
    $('#fileInput').onchange = (e) => { handleFiles(Array.from(e.target.files)); e.target.value = ''; };
    ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', (e) => handleFiles(Array.from(e.dataTransfer.files)));
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => { e.preventDefault(); if (!e.target.closest('#dropzone') && e.dataTransfer.files.length) handleFiles(Array.from(e.dataTransfer.files)); });
    $('#demoBtn').onclick = loadDemo;
    $('#clearAll').onclick = async () => { if (!confirm('¿Borrar todas las marcaciones cargadas en este navegador?')) return; await Store.clear(); await reload(); U.toast('Datos borrados'); };

    // config
    $('#cfgSave').onclick = saveConfig;
    $('#cfgReset').onclick = () => { if (!confirm('¿Restaurar la configuración predeterminada?')) return; S.cfg = JSON.parse(JSON.stringify(Engine.DEFAULT_CONFIG)); U.lsSet('asis.cfg', S.cfg); rConfig(); recompute(); };
    $('#addCoHolidays').onclick = () => {
      const years = new Set([new Date().getFullYear(), new Date().getFullYear() + 1]);
      if (S.model.minDate) years.add(+S.model.minDate.slice(0, 4));
      const cur = new Set($('#cfgHolidays').value.split(/\s+/).filter(Boolean));
      Array.from(years).forEach((y) => coHolidays(y).forEach((d) => cur.add(d)));
      $('#cfgHolidays').value = Array.from(cur).sort().join('\n');
      U.toast('Festivos agregados. Pulsa “Guardar y recalcular”.');
    };

    // drawer
    $('#dwClose').onclick = closePerson; $('#drawerBackdrop').onclick = closePerson;
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePerson(); });
    $('#dwPdf').onclick = () => Reports.pdfIndividual(personCtx());
    $('#dwExcel').onclick = () => Reports.excel(personCtx(), 'persona');

    // tooltips HTML (mapa de calor, calendario)
    const tip = $('#tooltip');
    document.addEventListener('mouseover', (e) => { const t = e.target.closest('[data-tip]'); if (t) { tip.textContent = t.dataset.tip; tip.classList.add('on'); } });
    document.addEventListener('mousemove', (e) => { if (!tip.classList.contains('on')) return; const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8); tip.style.left = x + 'px'; tip.style.top = e.clientY + 16 + 'px'; });
    document.addEventListener('mouseout', (e) => { if (e.target.closest('[data-tip]')) tip.classList.remove('on'); });

    let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (S.view === 'resumen' && S.model) Charts.heatmap($('#heatmap'), S.days); }, 200); });
  }

  async function init() {
    U.hydrateIcons();
    if (typeof Chart !== 'undefined') { Chart.defaults.font.family = 'Inter, system-ui, sans-serif'; }
    else U.toast('No se pudieron cargar las librerías (revisa la conexión a internet).', 'err');
    bind();
    S.view = U.lsGet('asis.view', 'resumen');
    if (!VIEWS[S.view]) S.view = 'resumen';
    await reload();
    go(S.view);
  }
  document.addEventListener('DOMContentLoaded', init);
  window.App = S;
})();
