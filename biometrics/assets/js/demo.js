/* Datos de demostración realistas para explorar el tablero sin cargar archivos. */
(function () {
  function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const NOMBRES = ['Ana', 'Carlos', 'María', 'Juan', 'Luisa', 'Andrés', 'Camila', 'Felipe', 'Valentina', 'Santiago', 'Daniela', 'Sebastián', 'Paola', 'Jorge', 'Natalia', 'Diego', 'Laura', 'Mauricio', 'Diana', 'Alejandro', 'Catalina', 'Ricardo', 'Juliana', 'Hernán', 'Marcela', 'Óscar', 'Sandra', 'Fernando', 'Liliana', 'Esteban', 'Gloria', 'Iván', 'Patricia', 'Julián', 'Claudia', 'Mateo', 'Adriana', 'Nicolás', 'Carolina', 'Gustavo'];
  const APELLIDOS = ['Gómez', 'Rodríguez', 'Martínez', 'López', 'García', 'Hernández', 'Díaz', 'Moreno', 'Álvarez', 'Muñoz', 'Rojas', 'Vargas', 'Castro', 'Ortiz', 'Ramírez', 'Torres', 'Suárez', 'Jiménez', 'Restrepo', 'Ospina', 'Cardona', 'Quintero', 'Mejía', 'Salazar', 'Arango', 'Zapata', 'Henao', 'Giraldo'];
  const AREAS = {
    prado: [['Docentes', 12], ['Administrativo', 5], ['Coordinación', 2], ['Servicios generales', 4], ['Seguridad', 2]],
    boston: [['Docentes', 14], ['Administrativo', 6], ['Coordinación', 2], ['Servicios generales', 5], ['Seguridad', 3]],
    kids: [['Docentes', 9], ['Auxiliares', 5], ['Administrativo', 3], ['Servicios generales', 3]],
  };
  const DEVICES = { prado: 'Huellero Sede Prado', boston: 'Terminal Sede Boston', kids: 'Lector Sede Kids' };

  function generate(cfg) {
    const r = rng(20261106);
    const gauss = () => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const punches = [];
    const today = U.todayKey();
    const startK = U.addDays(today, -110);
    let idSeq = 1000;
    for (const sede of ['prado', 'boston', 'kids']) {
      const sc = cfg.sedes[sede];
      const start = U.parseHM(sc.start), end = U.parseHM(sc.end);
      const staff = [];
      for (const [area, n] of AREAS[sede]) {
        for (let i = 0; i < n; i++) {
          const name = NOMBRES[Math.floor(r() * NOMBRES.length)] + ' ' + APELLIDOS[Math.floor(r() * APELLIDOS.length)] + ' ' + APELLIDOS[Math.floor(r() * APELLIDOS.length)];
          staff.push({
            id: String(idSeq++), name, area,
            arrBias: -12 + gauss() * 6 + (r() < 0.15 ? 14 : 0), // algunos llegan tarde con frecuencia
            leaveBias: (area === 'Administrativo' || area === 'Coordinación' ? 25 : 5) + gauss() * 10 + (r() < 0.2 ? 55 : 0),
            absRate: 0.015 + r() * 0.035,
            incRate: 0.01 + r() * 0.03,
            satWork: area === 'Servicios generales' || area === 'Seguridad' ? 0.5 : 0.04,
            startOffset: r() < 0.08 ? Math.floor(r() * 60) : 0, // ingresos posteriores
          });
        }
      }
      for (const st of staff) {
        let k = U.addDays(startK, st.startOffset);
        while (k <= today) {
          const wd = U.weekday(k);
          const work = cfg.holidays.includes(k) ? false : sc.days.includes(wd);
          const sat = wd === 6 && r() < st.satWork;
          if ((work && r() > st.absRate) || sat) {
            const base = U.dayStart(k);
            const s0 = sat ? 8 * 60 : start, e0 = sat ? 12 * 60 + 30 : end;
            let inM = s0 + st.arrBias + gauss() * 7 + (wd === 1 ? 3 : 0) + (r() < 0.04 ? 25 + r() * 40 : 0);
            let outM = e0 + st.leaveBias * (r() < 0.6 ? 1 : 0.3) + gauss() * 12 + (wd === 5 ? -10 : 0);
            if (r() < 0.04) outM = e0 - 30 - r() * 90; // salidas anticipadas
            if (k === today) { const now = new Date(); const nowM = now.getHours() * 60 + now.getMinutes(); if (inM > nowM) { k = U.addDays(k, 1); continue; } if (outM > nowM) outM = null; }
            const dev = DEVICES[sede];
            punches.push(mk(sede, st, base + Math.round(inM * 60) * 1000, dev, 'Entrada'));
            if (r() < 0.05) punches.push(mk(sede, st, base + Math.round((inM + 0.6) * 60) * 1000, dev, 'Entrada')); // doble marcación
            if (outM != null && r() > st.incRate) punches.push(mk(sede, st, base + Math.round(outM * 60) * 1000, dev, 'Salida'));
          }
          k = U.addDays(k, 1);
        }
      }
    }
    return punches;
  }
  function mk(sede, st, ts, device, status) {
    return { id: U.hash(sede + '|' + st.id + '|' + ts), sede, empId: st.id, name: st.name, dept: st.area, ts, device, status, file: 'demo' };
  }

  window.Demo = { generate };
})();
