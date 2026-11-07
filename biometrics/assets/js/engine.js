/* Motor de cálculo: convierte marcaciones crudas en jornadas (persona + día)
   con estado, horas trabajadas, tardanza, salida anticipada y horas extras. */
(function () {
  const DEFAULT_CONFIG = {
    sedes: {
      prado: { start: '07:00', end: '16:00', days: [1, 2, 3, 4, 5], satOn: false, satStart: '08:00', satEnd: '12:00' },
      boston: { start: '07:00', end: '16:00', days: [1, 2, 3, 4, 5], satOn: false, satStart: '08:00', satEnd: '12:00' },
      kids: { start: '07:30', end: '15:30', days: [1, 2, 3, 4, 5], satOn: false, satStart: '08:00', satEnd: '12:00' },
    },
    tolerance: 10,        // minutos de gracia en la entrada
    earlyTolerance: 10,   // minutos de gracia en la salida
    lunch: 60,            // minutos de almuerzo a descontar
    lunchAfter: 300,      // descontar almuerzo solo si la jornada supera estos minutos
    overtimeMin: 15,      // mínimo de minutos para contar horas extras
    earlyAsOvertime: false, // contar la llegada antes de la hora como extra
    dedup: 2,             // marcaciones a menos de N minutos se consideran repetidas
    countAbsences: true,
    holidays: [],
  };

  const STATUS = {
    ok: { label: 'A tiempo', cls: 'ok' },
    late: { label: 'Tarde', cls: 'late' },
    inc: { label: 'Incompleta', cls: 'inc' },
    abs: { label: 'Ausente', cls: 'abs' },
    off: { label: 'No laboral', cls: 'off' },
  };

  function scheduleFor(cfg, sede, key) {
    const sc = cfg.sedes[sede] || DEFAULT_CONFIG.sedes.prado;
    if (cfg.holidays.includes(key)) return null;
    const wd = U.weekday(key);
    if (wd === 6 && sc.satOn) return { start: U.parseHM(sc.satStart), end: U.parseHM(sc.satEnd) };
    if (sc.days.includes(wd) && !(wd === 6 && sc.satOn)) return { start: U.parseHM(sc.start), end: U.parseHM(sc.end) };
    return null;
  }

  function personKeyOf(p) { return p.sede + '|' + (p.empId || U.norm(p.name)); }

  /* Construye todo el modelo a partir de las marcaciones */
  function build(punches, cfg) {
    const people = new Map(); // key -> persona
    const byPersonDay = new Map();
    for (const p of punches) {
      const pk = personKeyOf(p);
      let per = people.get(pk);
      if (!per) {
        per = { key: pk, sede: p.sede, empId: p.empId, name: p.name, dept: p.dept, first: p.ts, last: p.ts, nameTs: p.ts };
        people.set(pk, per);
      }
      if (p.ts < per.first) per.first = p.ts;
      if (p.ts > per.last) per.last = p.ts;
      if (p.ts >= per.nameTs) { // conservar el nombre/área más reciente
        if (p.name && p.name !== p.empId) per.name = p.name;
        if (p.dept) per.dept = p.dept;
        per.nameTs = p.ts;
      }
      const dk = pk + '#' + U.dayKey(p.ts);
      let arr = byPersonDay.get(dk);
      if (!arr) byPersonDay.set(dk, (arr = []));
      arr.push(p.ts);
    }

    const days = [];
    for (const [dk, tsList] of byPersonDay) {
      const [pk, key] = dk.split('#');
      const per = people.get(pk);
      tsList.sort((a, b) => a - b);
      const marks = [];
      for (const t of tsList) if (!marks.length || t - marks[marks.length - 1] > cfg.dedup * 60000) marks.push(t);
      days.push(makeDay(per, key, marks, cfg));
    }

    // Ausencias: días laborales sin marcación entre la primera y la última marcación de cada persona
    if (cfg.countAbsences) {
      const have = new Set(days.map((d) => d.person.key + '#' + d.date));
      const today = U.todayKey();
      for (const per of people.values()) {
        let k = U.dayKey(per.first);
        const endK = U.dayKey(per.last) < today ? U.dayKey(per.last) : today;
        let guard = 0;
        while (k <= endK && guard++ < 1500) {
          if (!have.has(per.key + '#' + k) && scheduleFor(cfg, per.sede, k)) days.push(makeDay(per, k, [], cfg));
          k = U.addDays(k, 1);
        }
      }
    }
    days.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.person.name.localeCompare(b.person.name)));

    const allDates = days.map((d) => d.date);
    const minDate = allDates.length ? allDates.reduce((a, b) => (a < b ? a : b)) : null;
    const maxDate = allDates.length ? allDates.reduce((a, b) => (a > b ? a : b)) : null;
    const depts = Array.from(new Set(Array.from(people.values()).map((p) => p.dept).filter(Boolean))).sort();
    return { people, days, minDate, maxDate, depts, punchCount: punches.length };
  }

  function makeDay(per, key, marks, cfg) {
    const sch = scheduleFor(cfg, per.sede, key);
    const d = {
      person: per, date: key, wd: U.weekday(key), sede: per.sede, marks,
      in: marks[0] ?? null, out: marks.length > 1 ? marks[marks.length - 1] : null,
      scheduled: !!sch, schStart: sch ? sch.start : null, schEnd: sch ? sch.end : null,
      worked: 0, late: 0, early: 0, overtime: 0, status: 'abs',
    };
    if (!marks.length) { d.status = sch ? 'abs' : 'off'; return d; }
    const inMin = U.minOfDay(d.in);
    d.inMin = inMin;
    if (sch && inMin > sch.start + cfg.tolerance) d.late = inMin - sch.start;
    if (marks.length < 2) { d.status = 'inc'; return d; }
    const outMin = U.minOfDay(d.out);
    d.outMin = outMin;
    let worked = outMin - inMin;
    if (worked > cfg.lunchAfter) worked -= cfg.lunch;
    d.worked = Math.max(0, worked);
    if (sch) {
      if (outMin < sch.end - cfg.earlyTolerance) d.early = sch.end - outMin;
      let ot = Math.max(0, outMin - Math.max(sch.end, inMin));
      if (cfg.earlyAsOvertime) ot += Math.max(0, Math.min(sch.start, outMin) - inMin);
      d.overtime = ot >= cfg.overtimeMin ? ot : 0;
      d.status = d.late ? 'late' : 'ok';
    } else {
      d.overtime = d.worked >= cfg.overtimeMin ? d.worked : 0; // día no laboral: todo es extra
      d.status = 'off';
    }
    return d;
  }

  /* Filtra jornadas según los filtros del tablero */
  function filterDays(model, f) {
    const q = U.norm(f.q);
    return model.days.filter((d) =>
      (f.sede === 'all' || d.sede === f.sede) &&
      (!f.from || d.date >= f.from) && (!f.to || d.date <= f.to) &&
      (!f.dept || d.person.dept === f.dept) &&
      (!q || U.norm(d.person.name).includes(q) || U.norm(d.person.empId).includes(q)));
  }

  /* Indicadores agregados de un conjunto de jornadas */
  function summarize(days) {
    const present = days.filter((d) => d.marks.length > 0);
    const expected = days.filter((d) => d.scheduled);
    const presentSched = expected.filter((d) => d.marks.length > 0);
    const late = days.filter((d) => d.late > 0 && d.marks.length);
    const people = new Set(present.map((d) => d.person.key));
    const ins = presentSched.filter((d) => d.inMin != null).map((d) => d.inMin);
    const outs = presentSched.filter((d) => d.outMin != null).map((d) => d.outMin);
    return {
      people: people.size,
      jornadas: present.length,
      expected: expected.length,
      attendance: expected.length ? presentSched.length / expected.length : NaN,
      punctuality: presentSched.length ? presentSched.filter((d) => !d.late).length / presentSched.length : NaN,
      worked: U.sum(days, (d) => d.worked),
      overtime: U.sum(days, (d) => d.overtime),
      overtimeDays: days.filter((d) => d.overtime > 0).length,
      lateCount: late.length,
      lateMin: U.sum(late, (d) => d.late),
      incomplete: days.filter((d) => d.status === 'inc').length,
      absences: days.filter((d) => d.status === 'abs').length,
      early: days.filter((d) => d.early > 0).length,
      avgIn: ins.length ? U.avg(ins) : null,
      avgOut: outs.length ? U.avg(outs) : null,
      avgWorked: present.filter((d) => d.worked).length ? U.avg(present.filter((d) => d.worked), (d) => d.worked) : 0,
      marks: U.sum(days, (d) => d.marks.length),
    };
  }

  /* Resumen por persona */
  function byPerson(days) {
    const g = U.groupBy(days, (d) => d.person.key);
    return Array.from(g.values()).map((list) => ({ person: list[0].person, ...summarize(list), days: list }));
  }

  window.Engine = { DEFAULT_CONFIG, STATUS, build, filterDays, summarize, byPerson, scheduleFor };
})();
