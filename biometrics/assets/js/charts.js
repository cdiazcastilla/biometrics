/* Gráficas (Chart.js) con estilo coherente en modo claro y oscuro. */
(function () {
  const inst = {};
  const C = {};

  C.theme = () => ({
    text: U.cssVar('--text'), text2: U.cssVar('--text-2'), text3: U.cssVar('--text-3'),
    grid: U.cssVar('--grid'), surface: U.cssVar('--surface'),
    good: U.cssVar('--good'), warn: U.cssVar('--warn'), serious: U.cssVar('--serious'), crit: U.cssVar('--crit'),
    accent: U.cssVar('--accent'), muted: U.cssVar('--border-strong'),
    sede: { prado: U.sedeColor('prado'), boston: U.sedeColor('boston'), kids: U.sedeColor('kids') },
  });

  function baseOptions(t, extra = {}) {
    return {
      responsive: true, maintainAspectRatio: false, animation: { duration: 350 }, locale: 'es-CO',
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: t.text, titleColor: t.surface, bodyColor: t.surface, padding: 10, cornerRadius: 8,
          titleFont: { family: 'Inter', weight: '600', size: 12 }, bodyFont: { family: 'Inter', size: 12 },
          boxWidth: 8, boxHeight: 8, boxPadding: 4, usePointStyle: true,
        },
      },
      scales: {
        x: { grid: { display: false }, border: { color: t.grid }, ticks: { color: t.text3, font: { family: 'Inter', size: 11 }, maxRotation: 0, autoSkipPadding: 14 } },
        y: { grid: { color: t.grid, drawTicks: false }, border: { display: false }, ticks: { color: t.text3, font: { family: 'Inter', size: 11 }, padding: 8 }, beginAtZero: true },
      },
      ...extra,
    };
  }
  C.baseOptions = baseOptions;

  C.make = (id, config) => {
    if (inst[id]) inst[id].destroy();
    const el = document.getElementById(id);
    if (!el || typeof Chart === 'undefined') return null;
    inst[id] = new Chart(el, config);
    return inst[id];
  };

  C.legend = (id, items) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = items.length > 1 ? items.map((i) => `<span><span class="sw" style="background:${i.color}"></span>${U.esc(i.label)}</span>`).join('') : '';
  };

  const timeTicks = (v) => U.hm(v);

  /* ----- definiciones de gráficas ----- */
  C.trend = (id, days, sedes, dates, offscreen) => {
    const t = C.theme();
    const datasets = sedes.map((s) => {
      const byDate = U.groupBy(days.filter((d) => d.sede === s && d.marks.length), (d) => d.date);
      return {
        label: U.sedeShort(s), data: dates.map((k) => (byDate.get(k) || []).length),
        borderColor: t.sede[s], backgroundColor: t.sede[s], borderWidth: 2, pointRadius: 0, pointHoverRadius: 5,
        pointHoverBorderWidth: 2, pointHoverBorderColor: t.surface, cubicInterpolationMode: 'monotone', fill: false, spanGaps: true,
      };
    });
    const cfg = { type: 'line', data: { labels: dates.map((k) => U.WEEKDAYS[U.weekday(k)] + ' ' + U.fmtDate(k, 'short')), datasets }, options: baseOptions(t) };
    if (offscreen) return cfg;
    C.legend('lgTrend', datasets.map((d) => ({ label: d.label, color: d.borderColor })));
    return C.make(id, cfg);
  };

  C.status = (id, s, offscreen) => {
    const t = C.theme();
    const items = [
      ['A tiempo', s.ok, t.good],
      ['Tarde', s.late, t.warn],
      ['Incompleta', s.inc, t.serious],
      ['Ausente', s.abs, t.crit],
      ['Día no laboral', s.off, t.muted],
    ];
    const cfg = {
      type: 'bar',
      data: { labels: items.map((i) => i[0]), datasets: [{ data: items.map((i) => Math.max(0, i[1])), backgroundColor: items.map((i) => i[2]), borderRadius: 4, borderSkipped: 'start', barPercentage: 0.7, categoryPercentage: 0.9 }] },
      options: baseOptions(t, { indexAxis: 'y', interaction: { mode: 'nearest', axis: 'y', intersect: false } }),
    };
    cfg.options.scales.x.grid = { color: t.grid, drawTicks: false };
    cfg.options.scales.y.grid = { display: false };
    cfg.options.scales.y.ticks.color = t.text2;
    cfg.options.plugins.tooltip.callbacks = { label: (c) => ` ${U.num(c.raw)} jornadas` };
    return offscreen ? cfg : C.make(id, cfg);
  };

  C.arrival = (id, days, sedes, offscreen) => {
    const t = C.theme();
    const ins = days.filter((d) => d.inMin != null && d.scheduled);
    if (!ins.length) return C.make(id, { type: 'bar', data: { labels: [], datasets: [] }, options: baseOptions(t) });
    let lo = Math.floor(Math.min(...ins.map((d) => d.inMin)) / 15) * 15;
    let hi = Math.ceil(Math.max(...ins.map((d) => d.inMin)) / 15) * 15;
    // recortar colas largas al percentil 1–99
    const sorted = ins.map((d) => d.inMin).sort((a, b) => a - b);
    lo = Math.max(lo, Math.floor(sorted[Math.floor(sorted.length * 0.01)] / 15) * 15);
    hi = Math.min(hi, Math.ceil(sorted[Math.floor(sorted.length * 0.99)] / 15) * 15 + 15);
    const bins = []; for (let m = lo; m < hi; m += 15) bins.push(m);
    const datasets = sedes.map((s) => {
      const counts = bins.map(() => 0);
      ins.filter((d) => d.sede === s).forEach((d) => { const i = Math.floor((d.inMin - lo) / 15); if (i >= 0 && i < bins.length) counts[i]++; });
      return { label: U.sedeShort(s), data: counts, backgroundColor: t.sede[s], borderColor: t.surface, borderWidth: { top: 2 }, borderSkipped: 'start', borderRadius: 3, barPercentage: 0.92, categoryPercentage: 0.92 };
    });
    const cfg = { type: 'bar', data: { labels: bins.map((m) => U.hm(m)), datasets }, options: baseOptions(t) };
    cfg.options.scales.x.stacked = true; cfg.options.scales.y.stacked = true;
    cfg.options.plugins.tooltip.callbacks = { title: (c) => `${c[0].label} – ${U.hm(bins[c[0].dataIndex] + 15)}`, label: (c) => ` ${c.dataset.label}: ${c.raw} llegadas` };
    if (offscreen) return cfg;
    C.legend('lgArrival', datasets.map((d) => ({ label: d.label, color: d.backgroundColor })));
    return C.make(id, cfg);
  };

  C.extrasWeek = (id, days, sedes, offscreen) => {
    const t = C.theme();
    const ot = days.filter((d) => d.overtime > 0);
    const weeks = Array.from(new Set(days.map((d) => U.weekKey(d.date)))).sort();
    const datasets = sedes.map((s) => {
      const g = U.groupBy(ot.filter((d) => d.sede === s), (d) => U.weekKey(d.date));
      return { label: U.sedeShort(s), data: weeks.map((w) => +(U.sum(g.get(w) || [], (d) => d.overtime) / 60).toFixed(1)), backgroundColor: t.sede[s], borderColor: t.surface, borderWidth: { top: 2 }, borderSkipped: 'start', borderRadius: 3, maxBarThickness: 38 };
    });
    const cfg = { type: 'bar', data: { labels: weeks.map((w) => 'Sem. ' + U.fmtDate(w, 'short')), datasets }, options: baseOptions(t) };
    cfg.options.scales.x.stacked = true; cfg.options.scales.y.stacked = true;
    cfg.options.scales.y.ticks.callback = (v) => v + ' h';
    cfg.options.plugins.tooltip.callbacks = { label: (c) => ` ${c.dataset.label}: ${U.num(c.raw, 1)} h` };
    if (offscreen) return cfg;
    C.legend('lgExtrasWeek', datasets.map((d) => ({ label: d.label, color: d.backgroundColor })));
    return C.make(id, cfg);
  };

  C.extrasDept = (id, days, offscreen) => {
    const t = C.theme();
    const g = U.groupBy(days.filter((d) => d.overtime > 0), (d) => d.person.dept || 'Sin área');
    const rows = Array.from(g, ([k, v]) => [k, U.sum(v, (d) => d.overtime) / 60]).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const cfg = {
      type: 'bar',
      data: { labels: rows.map((r) => r[0]), datasets: [{ data: rows.map((r) => +r[1].toFixed(1)), backgroundColor: t.accent, borderRadius: 4, borderSkipped: 'start', barPercentage: 0.7 }] },
      options: baseOptions(t, { indexAxis: 'y', interaction: { mode: 'nearest', axis: 'y', intersect: false } }),
    };
    cfg.options.scales.x.grid = { color: t.grid, drawTicks: false };
    cfg.options.scales.x.ticks.callback = (v) => v + ' h';
    cfg.options.scales.y.grid = { display: false };
    cfg.options.scales.y.ticks.color = t.text2;
    cfg.options.plugins.tooltip.callbacks = { label: (c) => ` ${U.num(c.raw, 1)} horas extras` };
    return offscreen ? cfg : C.make(id, cfg);
  };

  C.avgArrival = (id, days, sedes, dates, offscreen) => {
    const t = C.theme();
    const datasets = sedes.map((s) => {
      const g = U.groupBy(days.filter((d) => d.sede === s && d.inMin != null && d.scheduled), (d) => d.date);
      return { label: U.sedeShort(s), data: dates.map((k) => (g.get(k) ? U.avg(g.get(k), (d) => d.inMin) : null)), borderColor: t.sede[s], backgroundColor: t.sede[s], borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, pointHoverBorderColor: t.surface, pointHoverBorderWidth: 2, cubicInterpolationMode: 'monotone', spanGaps: true };
    });
    const cfg = { type: 'line', data: { labels: dates.map((k) => U.fmtDate(k, 'short')), datasets }, options: baseOptions(t) };
    cfg.options.scales.y.beginAtZero = false;
    cfg.options.scales.y.ticks.callback = timeTicks;
    cfg.options.plugins.tooltip.callbacks = { label: (c) => ` ${c.dataset.label}: ${U.hm(c.raw)}` };
    if (offscreen) return cfg;
    C.legend('lgAvgArr', datasets.map((d) => ({ label: d.label, color: d.borderColor })));
    return C.make(id, cfg);
  };

  C.lateWeekday = (id, days, sedes, offscreen) => {
    const t = C.theme();
    const wds = [1, 2, 3, 4, 5, 6];
    const datasets = sedes.map((s) => ({
      label: U.sedeShort(s), data: wds.map((w) => days.filter((d) => d.sede === s && d.wd === w && d.late > 0 && d.marks.length).length),
      backgroundColor: t.sede[s], borderRadius: 4, borderSkipped: 'start', borderColor: t.surface, borderWidth: { left: 1, right: 1 }, maxBarThickness: 26,
    }));
    const cfg = { type: 'bar', data: { labels: wds.map((w) => U.WEEKDAYS[w]), datasets }, options: baseOptions(t) };
    cfg.options.plugins.tooltip.callbacks = { label: (c) => ` ${c.dataset.label}: ${c.raw} tardanzas` };
    if (offscreen) return cfg;
    C.legend('lgLateWd', datasets.map((d) => ({ label: d.label, color: d.backgroundColor })));
    return C.make(id, cfg);
  };

  C.person = (id, days, offscreen) => {
    const t = C.theme();
    const list = days.filter((d) => d.marks.length).sort((a, b) => (a.date < b.date ? -1 : 1));
    const sch = list.find((d) => d.scheduled);
    const ds = [
      { label: 'Entrada', data: list.map((d) => d.inMin ?? null), borderColor: t.sede.prado, backgroundColor: t.sede.prado },
      { label: 'Salida', data: list.map((d) => d.outMin ?? null), borderColor: t.sede.boston, backgroundColor: t.sede.boston },
    ].map((d) => ({ ...d, borderWidth: 2, pointRadius: 3, pointHoverRadius: 6, pointBorderColor: t.surface, pointBorderWidth: 1.5, tension: 0.2, spanGaps: true }));
    if (sch) {
      ds.push({ label: 'Hora de entrada', data: list.map((d) => d.schStart), borderColor: t.text3, borderDash: [4, 4], borderWidth: 1, pointRadius: 0, pointHoverRadius: 0 });
      ds.push({ label: 'Hora de salida', data: list.map((d) => d.schEnd), borderColor: t.text3, borderDash: [4, 4], borderWidth: 1, pointRadius: 0, pointHoverRadius: 0 });
    }
    const cfg = { type: 'line', data: { labels: list.map((d) => U.fmtDate(d.date, 'short')), datasets: ds }, options: baseOptions(t) };
    cfg.options.scales.y.beginAtZero = false;
    cfg.options.scales.y.ticks.callback = timeTicks;
    cfg.options.plugins.tooltip.callbacks = { label: (c) => (c.raw == null ? null : ` ${c.dataset.label}: ${U.hm(c.raw)}`) };
    if (offscreen) return cfg;
    C.legend('lgDw', ds.slice(0, 2).map((d) => ({ label: d.label, color: d.borderColor })));
    return C.make(id, cfg);
  };

  /* Mapa de calor día × hora (HTML) */
  C.heatmap = (el, days) => {
    const hours = []; for (let h = 5; h <= 21; h++) hours.push(h);
    const wds = [1, 2, 3, 4, 5, 6, 0];
    const counts = {};
    let max = 0;
    for (const d of days) for (const m of d.marks) {
      const h = new Date(m).getUTCHours();
      const k = d.wd + '-' + h;
      counts[k] = (counts[k] || 0) + 1;
      if (counts[k] > max) max = counts[k];
    }
    const light = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];
    const dark = getComputedStyle(document.documentElement).colorScheme === 'dark';
    const ramp = dark ? ['#104281', '#184f95', '#256abf', '#3987e5', '#5598e7', '#86b6ef', '#b7d3f6'] : light;
    const color = (v) => (!v ? '' : ramp[Math.min(ramp.length - 1, Math.floor((v / max) * (ramp.length - 0.001)))]);
    let html = `<div></div>` + hours.map((h) => `<div class="hm-col">${h % 2 ? '' : h}</div>`).join('');
    for (const w of wds) {
      if (w === 0 && !hours.some((h) => counts['0-' + h])) continue;
      html += `<div class="hm-row">${U.WEEKDAYS[w]}</div>`;
      html += hours.map((h) => { const v = counts[w + '-' + h] || 0; return `<div class="hm-cell" data-tip="${U.WEEKDAYS_LONG[w]} ${U.pad(h)}:00–${U.pad(h)}:59 · ${U.num(v)} marcaciones" style="${v ? 'background:' + color(v) : ''}"></div>`; }).join('');
    }
    el.style.setProperty('--cols', hours.length);
    el.innerHTML = html;
    el.insertAdjacentHTML('afterend', '');
    let scale = el.nextElementSibling;
    if (!scale || !scale.classList.contains('hm-scale')) { scale = document.createElement('div'); scale.className = 'hm-scale'; el.after(scale); }
    scale.innerHTML = `Menos <span class="ramp" style="background:linear-gradient(90deg,${ramp.join(',')})"></span> Más`;
  };

  /* Renderiza una configuración en un lienzo fuera de pantalla y devuelve PNG (para PDF) */
  C.toImage = async (cfg, w = 1000, h = 360) => {
    w = Math.round(w / 2); h = Math.round(h / 2); // tamaño lógico menor = textos legibles en el PDF
    if (typeof Chart === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.style.cssText = `position:fixed;left:-9999px;top:0;width:${w}px;height:${h}px`;
    document.body.appendChild(canvas);
    const c = { ...cfg, options: { ...cfg.options, responsive: false, animation: false, devicePixelRatio: 4 } };
    // colores fijos de modo claro para impresión
    const chart = new Chart(canvas, c);
    const ctx = canvas.getContext('2d');
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL('image/png');
    chart.destroy();
    canvas.remove();
    return url;
  };

  window.Charts = C;
})();
