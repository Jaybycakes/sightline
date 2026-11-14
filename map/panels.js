// Written with AI assistance (Claude / GitHub Copilot)
// Side panels: walk budget, alerts, controls, clock, banner, sources modal, data badge.
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
const fmtMin = m => (m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`);

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

export function createPanels(data, { setInputs, usingStubs }) {
  buildSources(data);
  dataBadge(data, usingStubs);
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

  let lastFactorsSig = '';
  return function render({ inputs, derived }) {
    const bdg = derived.budget;
    const scenarioOn = inputs.scenarioT !== null;

    $('clk-sol').textContent = inputs.sol;
    $('clk-ltst').textContent = fmtLtst(inputs.ltst);
    $('clk-eva').textContent = `${Math.round(inputs.evaMin)} min`;

    const card = $('budget');
    card.dataset.status = bdg.status;
    $('b-headline').textContent = bdg.headline;
    $('b-suit').textContent = fmtMin(Math.max(0, bdg.suitMinLeft));
    $('b-return').textContent = `${fmtMin(bdg.returnMin)} · ${derived.routeHomeKm.toFixed(1)} km`;
    $('b-turn').textContent = bdg.marginMin <= 0 ? 'now' : fmtMin(bdg.turnBackInMin);
    $('b-vis').textContent = `${Math.round(derived.limits.visibilityKm)} km`;

    const sig = JSON.stringify(bdg.factors.map(f => [f.id, f.level, f.message])) + derived.warnings.join('|');
    if (sig !== lastFactorsSig) {
      lastFactorsSig = sig;
      const items = bdg.factors.map(f => {
        const li = el('li', f.level);
        li.dataset.key = f.keys?.[0] || '';
        li.tabIndex = 0;
        const text = el('div');
        text.append(el('strong', '', f.label));
        const tag = tagFor(f.keys || [], data.constantsByKey);
        if (tag) text.append(el('span', tag[1], tag[0]));
        text.append(el('div', '', f.message));
        li.append(el('span', 'dot'), text);
        return li;
      });
      for (const w of derived.warnings) {
        const li = el('li', 'AMBER');
        li.append(el('span', 'dot'), el('div', '', w));
        items.push(li);
      }
      alerts.replaceChildren(...items);
    }

    const banner = $('banner');
    if (inputs.sepActive) {
      banner.textContent = `Solar particle event. Replay of the May 2024 storm, when Curiosity measured ${data.C.may2024_sep_dose_ugy.toLocaleString()} µGy at Mars. Return to shelter.`;
      banner.hidden = false;
    } else banner.hidden = true;

    const pct = derived.vis.homeVisiblePct3km;
    $('vis-stat').textContent = `Home visible from ${Math.round(pct)}% of ground within 3 km`;

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
