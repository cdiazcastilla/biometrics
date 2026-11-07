/* Generación de reportes: Excel (varias hojas), CSV y PDF profesional. */
(function () {
  const R = {};
  const h = (min) => +(min / 60).toFixed(2);
  const stLabel = (d) => Engine.STATUS[d.status].label;
  const scheduleTxt = (d) => (d.scheduled ? `${U.hm(d.schStart)}–${U.hm(d.schEnd)}` : 'No laboral');

  /* ---------- tablas base ---------- */
  R.tables = {
    detalle: (days) => ({
      head: ['Fecha', 'Día', 'Sede', 'ID', 'Nombre', 'Área', 'Entrada', 'Salida', 'Marcaciones', 'Horario', 'Horas trabajadas', 'Tardanza (min)', 'Salida anticipada (min)', 'Horas extras', 'Estado'],
      rows: days.map((d) => [U.fmtDate(d.date), U.WEEKDAYS[d.wd], U.sedeShort(d.sede), d.person.empId, d.person.name, d.person.dept, U.timeOf(d.in), U.timeOf(d.out), d.marks.length, scheduleTxt(d), h(d.worked), Math.round(d.late), Math.round(d.early), h(d.overtime), stLabel(d)]),
    }),
    personas: (rows) => ({
      head: ['Sede', 'ID', 'Nombre', 'Área', 'Días asistidos', 'Días laborales', '% Asistencia', '% Puntualidad', 'Tardanzas', 'Min. tarde', 'Ausencias', 'Incompletas', 'Horas trabajadas', 'Horas extras', 'Entrada prom.', 'Salida prom.'],
      rows: rows.map((r) => [U.sedeShort(r.person.sede), r.person.empId, r.person.name, r.person.dept, r.jornadas, r.expected, pctv(r.attendance), pctv(r.punctuality), r.lateCount, Math.round(r.lateMin), r.absences, r.incomplete, h(r.worked), h(r.overtime), U.hm(r.avgIn), U.hm(r.avgOut)]),
    }),
    sedes: (days, sedes) => ({
      head: ['Sede', 'Personas', 'Jornadas', '% Asistencia', '% Puntualidad', 'Entrada prom.', 'Salida prom.', 'Horas trabajadas', 'Horas extras', 'Tardanzas', 'Ausencias', 'Incompletas'],
      rows: sedes.map((s) => { const k = Engine.summarize(days.filter((d) => d.sede === s)); return [U.sedeName(s), k.people, k.jornadas, pctv(k.attendance), pctv(k.punctuality), U.hm(k.avgIn), U.hm(k.avgOut), h(k.worked), h(k.overtime), k.lateCount, k.absences, k.incomplete]; }),
    }),
    extras: (rows) => ({
      head: ['Sede', 'ID', 'Nombre', 'Área', 'Días con extras', 'Horas extras', 'Promedio por día (h)', 'Horas trabajadas'],
      rows: rows.filter((r) => r.overtime > 0).sort((a, b) => b.overtime - a.overtime).map((r) => [U.sedeShort(r.person.sede), r.person.empId, r.person.name, r.person.dept, r.overtimeDays, h(r.overtime), h(r.overtime / r.overtimeDays), h(r.worked)]),
    }),
    tardanzas: (rows) => ({
      head: ['Sede', 'ID', 'Nombre', 'Área', 'Tardanzas', 'Minutos acumulados', 'Promedio (min)', '% Puntualidad', 'Entrada prom.'],
      rows: rows.filter((r) => r.lateCount > 0).sort((a, b) => b.lateCount - a.lateCount || b.lateMin - a.lateMin).map((r) => [U.sedeShort(r.person.sede), r.person.empId, r.person.name, r.person.dept, r.lateCount, Math.round(r.lateMin), Math.round(r.lateMin / r.lateCount), pctv(r.punctuality), U.hm(r.avgIn)]),
    }),
    novedad: (days) => ({
      head: ['Fecha', 'Día', 'Sede', 'ID', 'Nombre', 'Área', 'Entrada', 'Salida', 'Horario', 'Novedad'],
      rows: days.map((d) => [U.fmtDate(d.date), U.WEEKDAYS[d.wd], U.sedeShort(d.sede), d.person.empId, d.person.name, d.person.dept, U.timeOf(d.in), U.timeOf(d.out), scheduleTxt(d), d.status === 'abs' ? 'Ausencia' : d.status === 'inc' ? 'Marcación incompleta' : d.early ? `Salida anticipada (${Math.round(d.early)} min)` : stLabel(d)]),
    }),
    marcaciones: (punches) => ({
      head: ['Fecha', 'Hora', 'Sede', 'ID', 'Nombre', 'Área', 'Dispositivo', 'Estado'],
      rows: punches.slice().sort((a, b) => a.ts - b.ts).map((p) => [U.fmtDate(U.dayKey(p.ts)), U.timeOf(p.ts) + ':' + U.pad(new Date(p.ts).getUTCSeconds()), U.sedeShort(p.sede), p.empId, p.name, p.dept, p.device, p.status]),
    }),
  };
  function pctv(v) { return isFinite(v) ? +(v * 100).toFixed(1) : ''; }

  /* ---------- Excel ---------- */
  function sheet(t, title, sub) {
    const aoa = [];
    if (title) { aoa.push([title]); aoa.push([sub || '']); aoa.push([]); }
    aoa.push(t.head, ...t.rows);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const off = title ? 3 : 0;
    ws['!cols'] = t.head.map((hd, i) => ({ wch: Math.min(40, Math.max(hd.length + 2, ...t.rows.slice(0, 300).map((r) => String(r[i] ?? '').length + 2))) }));
    if (t.rows.length) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: off, c: 0 }, e: { r: off + t.rows.length, c: t.head.length - 1 } }) };
    return ws;
  }

  R.excel = (ctx, which = 'completo') => {
    if (typeof XLSX === 'undefined') return U.toast('No se pudo cargar la librería de Excel.', 'err');
    const wb = XLSX.utils.book_new();
    const sub = `${ctx.scopeLabel} · ${U.fmtRange(ctx.from, ctx.to)} · Generado ${new Date().toLocaleString('es-CO')}`;
    const add = (name, t, title) => XLSX.utils.book_append_sheet(wb, sheet(t, title, sub), name);
    const T = R.tables;
    const S = ctx.summary;
    if (which === 'completo') {
      const kpi = { head: ['Indicador', 'Valor'], rows: [
        ['Personas con registros', S.people], ['Jornadas registradas', S.jornadas], ['% Asistencia', pctv(S.attendance)], ['% Puntualidad', pctv(S.punctuality)],
        ['Horas trabajadas', h(S.worked)], ['Horas extras', h(S.overtime)], ['Tardanzas', S.lateCount], ['Ausencias', S.absences], ['Marcaciones incompletas', S.incomplete],
        ['Salidas anticipadas', S.early], ['Entrada promedio', U.hm(S.avgIn)], ['Salida promedio', U.hm(S.avgOut)],
      ] };
      add('Resumen', kpi, 'Informe de asistencia');
      add('Por sede', T.sedes(ctx.days, ctx.sedes), 'Comparativo por sede');
      add('Por persona', T.personas(ctx.persons), 'Resumen por persona');
      add('Detalle diario', T.detalle(ctx.days.filter((d) => d.status !== 'off' || d.marks.length)));
      add('Horas extras', T.extras(ctx.persons), 'Horas extras');
      add('Tardanzas', T.tardanzas(ctx.persons), 'Tardanzas');
      add('Novedades', T.novedad(ctx.days.filter((d) => d.status === 'abs' || d.status === 'inc' || d.early > 0)), 'Ausencias, incompletas y salidas anticipadas');
      add('Marcaciones', T.marcaciones(ctx.punches));
    } else if (which === 'detalle') add('Detalle diario', T.detalle(ctx.days.filter((d) => d.status !== 'off' || d.marks.length)), 'Asistencia detallada');
    else if (which === 'extras') { add('Horas extras', T.extras(ctx.persons), 'Horas extras'); add('Detalle', T.detalle(ctx.days.filter((d) => d.overtime > 0)), 'Jornadas con horas extras'); }
    else if (which === 'tardanzas') { add('Tardanzas', T.tardanzas(ctx.persons), 'Tardanzas'); add('Detalle', T.detalle(ctx.days.filter((d) => d.late > 0 && d.marks.length)), 'Jornadas con tardanza'); }
    else if (which === 'novedades') {
      add('Ausencias', T.novedad(ctx.days.filter((d) => d.status === 'abs')), 'Ausencias');
      add('Incompletas', T.novedad(ctx.days.filter((d) => d.status === 'inc')), 'Marcaciones incompletas');
      add('Salidas anticipadas', T.novedad(ctx.days.filter((d) => d.early > 0)), 'Salidas anticipadas');
    } else if (which === 'personas') add('Por persona', T.personas(ctx.persons), 'Resumen por persona');
    else if (which === 'marcaciones') add('Marcaciones', T.marcaciones(ctx.punches));
    else if (which === 'persona') {
      add('Resumen', T.personas(ctx.persons), ctx.persons[0].person.name);
      add('Jornadas', T.detalle(ctx.days.filter((d) => d.status !== 'off' || d.marks.length)));
      add('Marcaciones', T.marcaciones(ctx.punches));
    }
    XLSX.writeFile(wb, R.fileName(ctx, which) + '.xlsx');
  };

  R.csv = (t, name) => {
    const esc = (v) => { const s = String(v ?? ''); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const txt = '﻿' + [t.head, ...t.rows].map((r) => r.map(esc).join(';')).join('\r\n');
    U.downloadBlob(new Blob([txt], { type: 'text/csv;charset=utf-8' }), name + '.csv');
  };

  R.fileName = (ctx, which) => {
    const scope = ctx.sedeId === 'all' ? 'todas-las-sedes' : ctx.sedeId;
    return `asistencia_${which}_${scope}_${ctx.from}_a_${ctx.to}`;
  };

  /* ---------- PDF ---------- */
  const INK = [11, 11, 11], INK2 = [82, 81, 78], INK3 = [125, 124, 119], LINE = [226, 225, 220], BAND = [240, 239, 236];
  const SEDE_RGB = { prado: [42, 120, 214], boston: [235, 104, 52], kids: [27, 175, 122] };

  function newDoc(ctx, title, subtitle) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...INK);
    const accent = SEDE_RGB[ctx.sedeId] || [42, 120, 214];
    doc.setFillColor(...accent); doc.roundedRect(14, 13, 3, 13, 1.5, 1.5, 'F');
    doc.text(title, 21, 20);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...INK2);
    doc.text(subtitle || `${ctx.scopeLabel}  ·  ${U.fmtDate(ctx.from, 'long')} al ${U.fmtDate(ctx.to, 'long')}`, 21, 26);
    doc.setFontSize(8.5); doc.setTextColor(...INK3);
    doc.text('Generado el ' + new Date().toLocaleString('es-CO'), W - 14, 20, { align: 'right' });
    if (ctx.filterNote) doc.text(ctx.filterNote, W - 14, 26, { align: 'right' });
    doc.setDrawColor(...LINE); doc.line(14, 31, W - 14, 31);
    doc._y = 37;
    return doc;
  }

  function ensure(doc, need) {
    const H = doc.internal.pageSize.getHeight();
    if (doc._y + need > H - 14) { doc.addPage(); doc._y = 16; }
  }

  function kpis(doc, items) {
    const W = doc.internal.pageSize.getWidth();
    const n = items.length, gap = 4, w = (W - 28 - gap * (n - 1)) / n, hgt = 20;
    ensure(doc, hgt + 4);
    items.forEach((it, i) => {
      const x = 14 + i * (w + gap), y = doc._y;
      doc.setFillColor(...BAND); doc.roundedRect(x, y, w, hgt, 2.5, 2.5, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...INK2);
      doc.text(it[0], x + 4, y + 6.5);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...INK);
      doc.text(String(it[1]), x + 4, y + 15);
    });
    doc._y += hgt + 6;
  }

  function heading(doc, text, sub) {
    ensure(doc, 16);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...INK);
    doc.text(text, 14, doc._y + 4);
    if (sub) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...INK3); doc.text(sub, 14, doc._y + 9); doc._y += 12; } else doc._y += 7;
  }

  function image(doc, img, x, w, hgt) {
    if (!img) return;
    doc.addImage(img, 'PNG', x, doc._y, w, hgt);
  }

  function table(doc, t, opts = {}) {
    if (!t.rows.length) {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(...INK3);
      doc.text('Sin registros en el periodo.', 14, doc._y + 4); doc._y += 10; return;
    }
    doc.autoTable({
      startY: doc._y, head: [t.head], body: opts.limit ? t.rows.slice(0, opts.limit) : t.rows,
      margin: { left: 14, right: 14, top: 16, bottom: 14 }, theme: 'plain',
      styles: { font: 'helvetica', fontSize: opts.fontSize || 8, textColor: INK, cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 }, lineColor: LINE, lineWidth: { bottom: 0.2 } },
      headStyles: { fillColor: BAND, textColor: INK2, fontStyle: 'bold', fontSize: (opts.fontSize || 8) - 0.5 },
      columnStyles: opts.columnStyles || {},
      didParseCell: (c) => { if (c.section === 'body' && typeof c.cell.raw === 'number') c.cell.styles.halign = 'right'; },
    });
    doc._y = doc.lastAutoTable.finalY + 8;
    if (opts.limit && t.rows.length > opts.limit) {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(...INK3);
      doc.text(`Mostrando ${opts.limit} de ${t.rows.length}. El detalle completo está en el reporte de Excel.`, 14, doc._y - 3); doc._y += 3;
    }
  }

  function footer(doc) {
    const n = doc.getNumberOfPages(), W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...INK3);
      doc.text('Control de Asistencia · Prado · Boston · Kids', 14, H - 7);
      doc.text(`Página ${i} de ${n}`, W - 14, H - 7, { align: 'right' });
    }
  }

  /* fuerza el tema claro mientras se dibujan las gráficas para el PDF */
  async function withLight(fn) {
    const root = document.documentElement, prev = root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'light');
    try { return await fn(); } finally { if (prev) root.setAttribute('data-theme', prev); else root.removeAttribute('data-theme'); }
  }

  function kpiItems(S) {
    return [
      ['Personas', U.num(S.people)], ['Asistencia', U.pct(S.attendance, 1)], ['Puntualidad', U.pct(S.punctuality, 1)],
      ['Horas trabajadas', U.num(S.worked / 60)], ['Horas extras', U.num(S.overtime / 60, 1)], ['Tardanzas', U.num(S.lateCount)],
      ['Ausencias', U.num(S.absences)], ['Incompletas', U.num(S.incomplete)],
    ];
  }

  R.pdf = async (ctx, which = 'general') => {
    if (!window.jspdf) return U.toast('No se pudo cargar la librería de PDF.', 'err');
    U.loading(true, 'Generando PDF…');
    await U.nextFrame();
    try {
      const T = R.tables, S = ctx.summary;
      const W = 297, half = (W - 28 - 6) / 2;
      const titles = { general: 'Informe de asistencia', extras: 'Informe de horas extras', tardanzas: 'Informe de puntualidad', novedades: 'Informe de novedades', individual: 'Reportes individuales' };
      if (which === 'individual') return await R.pdfIndividual(ctx);
      const doc = newDoc(ctx, titles[which]);
      const imgs = await withLight(async () => ({
        trend: which === 'general' ? await Charts.toImage(Charts.trend(null, ctx.days, ctx.sedes, ctx.dates, true), 1600, 420) : null,
        arrival: which === 'general' || which === 'tardanzas' ? await Charts.toImage(Charts.arrival(null, ctx.days, ctx.sedes, true), 900, 420) : null,
        extrasW: which === 'general' || which === 'extras' ? await Charts.toImage(Charts.extrasWeek(null, ctx.days, ctx.sedes, true), 900, 420) : null,
        extrasD: which === 'extras' ? await Charts.toImage(Charts.extrasDept(null, ctx.days, true), 900, 420) : null,
        lateWd: which === 'tardanzas' ? await Charts.toImage(Charts.lateWeekday(null, ctx.days, ctx.sedes, true), 900, 420) : null,
      }));
      const sedeLegend = ctx.sedes.length > 1 ? ctx.sedes.map(U.sedeShort).join(' · ') : '';

      if (which === 'general') {
        kpis(doc, kpiItems(S));
        ensure(doc, 86); heading(doc, 'Personas presentes por día laboral', sedeLegend && 'Series: ' + legendTxt(ctx.sedes)); image(doc, imgs.trend, 14, W - 28, 68); doc._y += 74;
        ensure(doc, 78); heading(doc, 'Hora de llegada y horas extras por semana', sedeLegend && 'Series: ' + legendTxt(ctx.sedes));
        ensure(doc, 64); image(doc, imgs.arrival, 14, half, 60); image(doc, imgs.extrasW, 14 + half + 6, half, 60); doc._y += 66;
        if (ctx.sedes.length > 1) { heading(doc, 'Comparativo por sede'); table(doc, T.sedes(ctx.days, ctx.sedes), { fontSize: 8.5 }); }
        heading(doc, 'Resumen por persona'); table(doc, T.personas(ctx.persons.slice().sort((a, b) => a.person.name.localeCompare(b.person.name))), { fontSize: 7.2 });
        heading(doc, 'Mayores horas extras'); table(doc, T.extras(ctx.persons), { limit: 15 });
        heading(doc, 'Mayores tardanzas'); table(doc, T.tardanzas(ctx.persons), { limit: 15 });
      } else if (which === 'extras') {
        kpis(doc, [['Horas extras', U.num(S.overtime / 60, 1)], ['Jornadas con extras', U.num(S.overtimeDays)], ['Personas con extras', U.num(ctx.persons.filter((p) => p.overtime > 0).length)], ['Promedio por jornada', U.dur(S.overtimeDays ? S.overtime / S.overtimeDays : 0)], ['Horas trabajadas', U.num(S.worked / 60)]]);
        ensure(doc, 78); heading(doc, 'Horas extras por semana y por área', sedeLegend && 'Series: ' + legendTxt(ctx.sedes));
        ensure(doc, 64); image(doc, imgs.extrasW, 14, half, 60); image(doc, imgs.extrasD, 14 + half + 6, half, 60); doc._y += 66;
        heading(doc, 'Horas extras por persona'); table(doc, T.extras(ctx.persons));
        heading(doc, 'Detalle de jornadas con horas extras'); table(doc, T.detalle(ctx.days.filter((d) => d.overtime > 0)), { fontSize: 7 });
      } else if (which === 'tardanzas') {
        kpis(doc, [['Puntualidad', U.pct(S.punctuality, 1)], ['Tardanzas', U.num(S.lateCount)], ['Minutos tarde', U.num(S.lateMin)], ['Entrada promedio', U.hm(S.avgIn)], ['Salidas anticipadas', U.num(S.early)]]);
        ensure(doc, 78); heading(doc, 'Hora de llegada y tardanzas por día de la semana', sedeLegend && 'Series: ' + legendTxt(ctx.sedes));
        ensure(doc, 64); image(doc, imgs.arrival, 14, half, 60); image(doc, imgs.lateWd, 14 + half + 6, half, 60); doc._y += 66;
        heading(doc, 'Tardanzas por persona'); table(doc, T.tardanzas(ctx.persons));
        heading(doc, 'Detalle de jornadas con tardanza'); table(doc, T.detalle(ctx.days.filter((d) => d.late > 0 && d.marks.length)), { fontSize: 7 });
      } else if (which === 'novedades') {
        kpis(doc, [['Ausencias', U.num(S.absences)], ['Incompletas', U.num(S.incomplete)], ['Salidas anticipadas', U.num(S.early)], ['Tardanzas', U.num(S.lateCount)]]);
        heading(doc, 'Ausencias', 'Días laborales sin ninguna marcación'); table(doc, T.novedad(ctx.days.filter((d) => d.status === 'abs')), { fontSize: 7.5 });
        heading(doc, 'Marcaciones incompletas', 'Días con una sola marcación'); table(doc, T.novedad(ctx.days.filter((d) => d.status === 'inc')), { fontSize: 7.5 });
        heading(doc, 'Salidas anticipadas'); table(doc, T.novedad(ctx.days.filter((d) => d.early > 0)), { fontSize: 7.5 });
      }
      footer(doc);
      doc.save(R.fileName(ctx, which) + '.pdf');
    } catch (e) {
      console.error(e); U.toast('No se pudo generar el PDF: ' + e.message, 'err');
    } finally { U.loading(false); }
  };

  function legendTxt(sedes) { return sedes.map((s) => U.sedeShort(s) + ' (' + ({ prado: 'azul', boston: 'naranja', kids: 'verde' }[s]) + ')').join(', '); }

  /* Una o varias personas: una sección por persona */
  R.pdfIndividual = async (ctx) => {
    U.loading(true, 'Generando reportes individuales…');
    await U.nextFrame();
    try {
      const persons = ctx.persons.slice().sort((a, b) => a.person.sede.localeCompare(b.person.sede) || a.person.name.localeCompare(b.person.name));
      if (!persons.length) { U.toast('No hay personas en el filtro actual.'); return; }
      let doc = null;
      for (const p of persons) {
        const per = p.person;
        const sub = `${U.sedeName(per.sede)} · ID ${per.empId || '—'}${per.dept ? ' · ' + per.dept : ''} · ${U.fmtDate(ctx.from, 'long')} al ${U.fmtDate(ctx.to, 'long')}`;
        if (!doc) doc = newDoc({ ...ctx, sedeId: per.sede }, per.name, sub);
        else { doc.addPage(); drawHeader(doc, per, sub); }
        kpis(doc, [['Días asistidos', `${p.jornadas}/${p.expected}`], ['Asistencia', U.pct(p.attendance, 1)], ['Puntualidad', U.pct(p.punctuality, 1)], ['Horas trabajadas', U.num(p.worked / 60, 1)], ['Horas extras', U.num(p.overtime / 60, 1)], ['Tardanzas', p.lateCount], ['Ausencias', p.absences], ['Entrada prom.', U.hm(p.avgIn)]]);
        const img = await withLight(() => Charts.toImage(Charts.person(null, p.days, true), 1600, 380));
        ensure(doc, 74); heading(doc, 'Entrada (azul) y salida (naranja) por día', 'Las líneas punteadas indican el horario establecido');
        ensure(doc, 60); image(doc, img, 14, 297 - 28, 56); doc._y += 62;
        heading(doc, 'Detalle de jornadas');
        const days = p.days.filter((d) => d.status !== 'off' || d.marks.length).sort((a, b) => (a.date < b.date ? -1 : 1));
        const t = R.tables.detalle(days);
        table(doc, { head: t.head.filter((_, i) => ![2, 3, 4, 5].includes(i)), rows: t.rows.map((r) => r.filter((_, i) => ![2, 3, 4, 5].includes(i))) }, { fontSize: 7.8 });
      }
      footer(doc);
      doc.save(persons.length === 1 ? `reporte_${U.norm(persons[0].person.name).replace(/ /g, '-')}_${ctx.from}_a_${ctx.to}.pdf` : R.fileName(ctx, 'individuales') + '.pdf');
    } catch (e) { console.error(e); U.toast('No se pudo generar el PDF: ' + e.message, 'err'); } finally { U.loading(false); }
  };

  function drawHeader(doc, per, sub) {
    const W = doc.internal.pageSize.getWidth();
    doc.setFillColor(...(SEDE_RGB[per.sede] || [42, 120, 214])); doc.roundedRect(14, 13, 3, 13, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...INK); doc.text(per.name, 21, 20);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...INK2); doc.text(sub, 21, 26);
    doc.setDrawColor(...LINE); doc.line(14, 31, W - 14, 31);
    doc._y = 37;
  }

  window.Reports = R;
})();
