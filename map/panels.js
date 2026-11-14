// Written with AI assistance (Claude / GitHub Copilot)
// Side panels: answer card, crew/visibility/position cards, alerts, controls, clock, banner,
// timeline checkpoints, sources modal, data badge.
// Renders from the store; control events call setInputs (user actions, never inside render).

const $ = id => document.getElementById(id);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const fmtLtst = h => {
  const t = ((h % 24) + 24) % 24;
  return `${String(Math.floor(t)).padStart(2, '0')}:${String(Math.floor((t % 1) * 60)).padStart(2, '0')}`;
};
const fmtMin = m => {
  if (!Number.isFinite(m)) return '–';
  return m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`;
};
const fmtNum = (v, digits = 0, unit = '') => (Number.isFinite(v) ? `${v.toFixed(digits)}${unit}` : '–');
const fmtM = v => (Number.isFinite(v) ? `${Math.round(v)} m` : '–');
const fmtKm = v => (Number.isFinite(v) ? `${v.toFixed(v < 10 ? 1 : 0)} km` : '–');

// Crew card = factors that are not about dust, visibility or position; if none match, the 3 most severe.
const NOT_CREW = /dust|vis|pos|fix|sky|landmark/i;
const SEVERITY = { RED: 0, AMBER: 1, GREEN: 2 };
function crewFactors(factors) {
  const bySeverity = [...factors].sort((a, b) => SEVERITY[a.level] - SEVERITY[b.level]);
  const crew = bySeverity.filter(f => !NOT_CREW.test(f.id));
  return (crew.length ? crew : bySeverity).slice(0, 3);
}

const EVENT_LABELS = { eva_start: 'EVA start', sep_onset: 'Solar storm', skyline_fix: 'Skyline fix', eva_end: 'EVA end' };
const eventLabel = ev => (ev.type === 'tau' ? `Dust τ ${ev.value}` : EVENT_LABELS[ev.type] ?? ev.type);

function buildTimeline(data) {
  const events = data.scenario?.events ?? [];
  if (!events.length) return [];
  const end = events[events.length - 1].tMin;
  const cps = events.map(ev => {
    const cp = el('li', 'cp');
    cp.style.left = `${end > 0 ? (ev.tMin / end) * 100 : 0}%`;
    cp.append(el('span', 'cp-dot'), el('span', 'cp-label', eventLabel(ev)));
    return { tMin: ev.tMin, cp };
  });
  $('t-track').replaceChildren(...cps.map(c => c.cp));
  return cps;
}

function markCheckpoints(cps, t) {
  let current = -1;
  cps.forEach((c, i) => {
    const passed = t !== null && c.tMin <= t;
    c.cp.classList.toggle('passed', passed);
    if (passed) current = i;
  });
  cps.forEach((c, i) => {
    c.cp.classList.toggle('current', i === current);
    if (i === current) c.cp.setAttribute('aria-current', 'step'); else c.cp.removeAttribute('aria-current');
  });
}

function tagFor(keys, byKey) {
  const rows = keys.map(k => byKey[k]).filter(Boolean);
  if (!rows.length) return null;
  const est = rows.some(r => r.isEstimate), nasa = rows.some(r => !r.isEstimate);
  if (nasa && est) return ['NASA data + estimate', 'tag tag-nasa'];
  return nasa ? ['NASA data', 'tag tag-nasa'] : ['Estimate', 'tag tag-est'];
}

function buildSources(data) {
  const body = $('src-rows');
  body.replaceChildren(...data.constantsRows.map(r => {
    const tr = el('tr');
    tr.id = `src-${r.key}`;
    tr.append(el('td', '', r.label), el('td', '', `${r.value} ${r.unit}`));
    const type = el('td');
    type.append(el('span', r.isEstimate ? 'tag tag-est' : 'tag tag-nasa', r.isEstimate ? 'Estimate' : 'NASA data'));
    const src = el('td', '', r.source);
    if (typeof r.url === 'string' && r.url.startsWith('https://')) {
      const a = el('a', '', ' source');
      a.href = r.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      src.append(a);
    }
    tr.append(type, src);
    return tr;
  }));
}

function openSources(key) {
  const dlg = $('dlg-sources');
  if (!dlg.open) dlg.showModal();
  document.querySelectorAll('.src-table tr.flash').forEach(r => r.classList.remove('flash'));
  const row = key && document.getElementById(`src-${key}`);
  if (row) { row.classList.add('flash'); row.scrollIntoView({ block: 'center' }); }
}

function dataBadge(data, usingStubs) {
  const mocks = Object.entries(data.status).filter(([, s]) => s !== 'real').map(([k, s]) => `${k} (${s})`);
  if (usingStubs.length) mocks.push(...usingStubs.map(s => `${s} (placeholder)`));
  if (!mocks.length) return;
  const b = el('div', 'mock-badge');
  b.setAttribute('role', 'status');
  b.append(el('strong', '', 'MOCK DATA'), document.createTextNode(` ${mocks.join(', ')}`));
  document.body.append(b);
}

function factorItem(f, byKey) {
  const li = el('li', f.level);
  li.dataset.key = f.keys?.[0] || '';
  li.tabIndex = 0;
  const text = el('div');
  text.append(el('strong', '', f.label));
  const tag = tagFor(f.keys || [], byKey);
  if (tag) text.append(el('span', tag[1], tag[0]));
  text.append(el('div', '', f.message));
  li.append(el('span', 'dot'), text);
  return li;
}

export function createPanels(data, { setInputs, usingStubs }) {
  buildSources(data);
  dataBadge(data, usingStubs);
  const checkpoints = buildTimeline(data);
  $('btn-sources').addEventListener('click', () => openSources());

  const sliders = [
    ['c-sol', 'o-sol', 'sol', v => `${v}`],
    ['c-ltst', 'o-ltst', 'ltst', fmtLtst],
    ['c-tau', 'o-tau', 'tau', v => Number(v).toFixed(1)]
  ];
  for (const [id, , key] of sliders) {
    $(id).addEventListener('input', e => setInputs({ [key]: Number(e.target.value) }));
  }
  $('c-sep').addEventListener('change', e => setInputs({ sepActive: e.target.checked }));
  $('c-sans').addEventListener('change', e => setInputs({ sansAffected: e.target.checked }));
  $('c-mode').addEventListener('change', e => setInputs({ routeMode: e.target.value }));

  const alerts = $('alerts');
  alerts.addEventListener('click', e => {
    const li = e.target.closest('li[data-key]');
    if (li) openSources(li.dataset.key);
  });
  alerts.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const li = e.target.closest('li[data-key]');
    if (li) { e.preventDefault(); openSources(li.dataset.key); }
  });

  let lastFactorsSig = '', lastCrewSig = '';

  function renderCrew(factors) {
    const crew = crewFactors(factors);
    const sig = crew.map(f => `${f.id}:${f.level}`).join('|');
    if (sig === lastCrewSig) return;
    lastCrewSig = sig;
    $('crew-list').replaceChildren(...crew.map(f => {
      const li = el('li', f.level);
      li.append(el('span', 'dot'), el('span', '', f.label), el('span', 'lvl', f.level));
      return li;
    }));
  }

  function renderAlerts(bdg, derived) {
    const sig = JSON.stringify(bdg.factors.map(f => [f.id, f.level, f.message])) + derived.warnings.join('|');
    if (sig === lastFactorsSig) return;
    lastFactorsSig = sig;
    const items = bdg.factors.map(f => factorItem(f, data.constantsByKey));
    for (const w of derived.warnings) {
      const li = el('li', 'AMBER');
      li.append(el('span', 'dot'), el('div', '', w));
      items.push(li);
    }
    alerts.replaceChildren(...items);
  }

  function renderCards(inputs, derived) {
    const bdg = derived.budget;
    const card = $('budget');
    card.dataset.status = bdg.status;
    $('b-headline').textContent = bdg.headline;
    $('b-return').textContent = fmtMin(bdg.returnMin);
    $('b-km').textContent = fmtKm(derived.routeHomeKm);
    $('b-suit').textContent = fmtMin(Math.max(0, bdg.suitMinLeft));
    $('b-turn').textContent = bdg.marginMin <= 0 ? 'now' : fmtMin(bdg.turnBackInMin);
    $('b-speed').textContent = fmtNum(derived.limits.speedKmh, 1, ' km/h');
    $('b-vis').textContent = fmtKm(derived.limits.visibilityKm);
    $('b-tau').textContent = fmtNum(inputs.tau, 1);
    const pct = derived.vis.homeVisiblePct3km;
    $('vis-stat').textContent = Number.isFinite(pct) ? `Home visible from ${Math.round(pct)}% of ground within 3 km` : '–';
    const posM = derived.posUncertaintyM;
    $('b-pos').textContent = Number.isFinite(posM) ? `± ${Math.round(posM)} m` : '–';
    $('b-fix').textContent = Number.isFinite(inputs.distSinceFixM) ? `${fmtM(inputs.distSinceFixM)} ago` : '–';
    $('b-acc').textContent = Number.isFinite(inputs.fixUncertaintyM) ? `± ${Math.round(inputs.fixUncertaintyM)} m` : '–';
  }

  return function render({ inputs, derived }) {
    const scenarioOn = inputs.scenarioT !== null;

    $('clk-sol').textContent = inputs.sol;
    $('clk-ltst').textContent = fmtLtst(inputs.ltst);
    $('clk-eva').textContent = `${Math.round(inputs.evaMin)} min`;

    renderCards(inputs, derived);
    renderCrew(derived.budget.factors);
    renderAlerts(derived.budget, derived);
    markCheckpoints(checkpoints, inputs.scenarioT);

    const banner = $('banner');
    if (inputs.sepActive) {
      banner.textContent = `Solar particle event. Replay of the May 2024 storm, when Curiosity measured ${data.C.may2024_sep_dose_ugy.toLocaleString()} µGy at Mars. Return to shelter.`;
      banner.hidden = false;
    } else banner.hidden = true;

    for (const [id, out, key, fmt] of sliders) {
      $(id).value = inputs[key];
      $(out).textContent = fmt(inputs[key]);
      $(id).disabled = scenarioOn;
    }
    $('c-sep').checked = inputs.sepActive; $('c-sep').disabled = scenarioOn;
    $('c-sans').checked = inputs.sansAffected;
    $('c-mode').value = inputs.routeMode;
  };
}
