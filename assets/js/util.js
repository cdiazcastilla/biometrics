/* Utilidades compartidas. Todas las fechas se manejan como "hora de pared"
   guardada en UTC (Date.UTC), así no hay problemas de zona horaria. */
(function () {
  const U = {};

  U.SEDES = [
    { id: 'prado', name: 'Sede Prado' },
    { id: 'boston', name: 'Sede Boston' },
    { id: 'kids', name: 'Sede Kids' },
  ];
  U.sedeName = (id) => (U.SEDES.find((s) => s.id === id) || { name: id }).name;
  U.sedeShort = (id) => U.sedeName(id).replace('Sede ', '');

  U.WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  U.WEEKDAYS_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  U.MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  const pad = (n) => String(n).padStart(2, '0');
  U.pad = pad;
  U.DAY = 86400000;

  U.dayKey = (ts) => { const d = new Date(ts); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
  U.dayStart = (key) => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  U.minOfDay = (ts) => { const d = new Date(ts); return d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60; };
  U.weekday = (key) => new Date(U.dayStart(key)).getUTCDay();
  U.addDays = (key, n) => U.dayKey(U.dayStart(key) + n * U.DAY);
  U.todayKey = () => { const n = new Date(); return n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate()); };
  U.weekKey = (key) => { const wd = (U.weekday(key) + 6) % 7; return U.addDays(key, -wd); }; // lunes
  U.monthKey = (key) => key.slice(0, 7);

  U.hm = (min) => {
    if (min == null || isNaN(min)) return '—';
    const m = Math.round(min);
    return pad(Math.floor(m / 60) % 24) + ':' + pad(m % 60);
  };
  U.timeOf = (ts) => (ts == null ? '—' : U.hm(U.minOfDay(ts)));
  U.parseHM = (s) => { if (!s) return null; const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };
  U.dur = (min) => {
    if (!min) return '0h';
    const m = Math.round(min);
    const h = Math.floor(m / 60), r = m % 60;
    return h ? (r ? `${h}h ${pad(r)}m` : `${h}h`) : `${r}m`;
  };
  U.hours = (min, d = 1) => (min / 60).toFixed(d).replace('.', ',');
  U.num = (n, d = 0) => Number(n || 0).toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
  U.pct = (n, d = 0) => (isFinite(n) ? U.num(n * 100, d) + '%' : '—');
  U.fmtDate = (key, opts) => {
    if (!key) return '—';
    const d = new Date(U.dayStart(key));
    if (opts === 'short') return pad(d.getUTCDate()) + '/' + pad(d.getUTCMonth() + 1);
    if (opts === 'long') return U.WEEKDAYS_LONG[d.getUTCDay()] + ' ' + d.getUTCDate() + ' de ' + U.MONTHS[d.getUTCMonth()] + ' de ' + d.getUTCFullYear();
    return pad(d.getUTCDate()) + '/' + pad(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();
  };
  U.fmtRange = (a, b) => `${U.fmtDate(a)} – ${U.fmtDate(b)}`;

  U.norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  U.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  U.hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  U.groupBy = (arr, fn) => { const m = new Map(); for (const x of arr) { const k = fn(x); let a = m.get(k); if (!a) m.set(k, (a = [])); a.push(x); } return m; };
  U.sum = (arr, fn) => arr.reduce((s, x) => s + (fn ? fn(x) : x), 0);
  U.avg = (arr, fn) => (arr.length ? U.sum(arr, fn) / arr.length : null);
  U.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  U.$ = (s, r = document) => r.querySelector(s);
  U.$$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  U.cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  U.sedeColor = (id) => U.cssVar('--s-' + id) || '#888';

  const AVATAR = ['#2a78d6', '#eb6834', '#1baf7a', '#6250d6', '#e87ba4', '#008300', '#c98500', '#e34948'];
  U.avatarColor = (key) => AVATAR[parseInt(U.hash(key), 36) % AVATAR.length];

  /* Iconos (trazos estilo lucide) */
  const ICONS = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    calendar: '<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.7.8 2.7 2.5 3 5.2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    alarm: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M5 3 2 6M19 3l3 3"/>',
    alert: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    upload: '<path d="M12 15V4M7 9l5-5 5 5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    sheet: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    person: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.2-7 8-7s7 2.5 8 7"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    logout: '<path d="M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 17l-5-5 5-5M5 12h11"/>',
    building: '<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M2 21h20M8 7h4M8 11h4M8 15h4"/>',
    fingerprint: '<path d="M12 11v3a8 8 0 0 1-1.5 4.7M8 9.5a4 4 0 0 1 8 .5v2.5M5 7.5A8 8 0 0 1 20 12v1M4.3 12A8 8 0 0 0 4 14M16 16.5a14 14 0 0 1-1 3.5M8 14a4 4 0 0 1-.8 2.4"/>',
  };
  U.icon = (name) => `<svg viewBox="0 0 24 24">${ICONS[name] || ''}</svg>`;
  U.hydrateIcons = (root = document) => {
    root.querySelectorAll('i[data-icon]').forEach((el) => { if (!el.firstChild) el.innerHTML = U.icon(el.dataset.icon); });
  };

  U.toast = (msg, kind) => {
    const el = document.createElement('div');
    el.className = 'toast' + (kind === 'err' ? ' err' : '');
    el.textContent = msg;
    document.getElementById('toasts').appendChild(el);
    setTimeout(() => el.remove(), kind === 'err' ? 6000 : 3500);
  };
  U.loading = (on, text) => {
    document.getElementById('loading').classList.toggle('on', !!on);
    if (text) document.getElementById('loadingText').textContent = text;
  };
  U.nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

  U.lsGet = (k, def) => { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } };
  U.lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } };

  U.downloadBlob = (blob, name) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  window.U = U;
})();
