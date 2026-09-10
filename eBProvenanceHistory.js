import { eBliss } from './eBSDK.js';

let initialized = false;
let selectedHolonId = null;
let observer = null;
let rendering = false;
let generation = 0;

function parseChange(value)
{
  try
  {
    return typeof value === 'string' ? JSON.parse(value) : value;
  }
  catch
  {
    return null;
  }
}

function humanizeValue(value)
{
  if (value === undefined) return '—';
  if (value === null) return 'null';
  if (typeof value === 'object')
  {
    try
    {
      return JSON.stringify(value);
    }
    catch
    {
      return String(value);
    }
  }
  return String(value) || 'empty';
}

function humanizeChange(change)
{
  const details = parseChange(change?.provenance?.changes);
  if (!details) return '';

  if (details.entity === 'holon' && details.operation === 'update')
  {
    return Object.entries(details.values || {}).map(([key, value]) =>
    {
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
      return `${label}: ${humanizeValue(value)}`;
    }).join('\n');
  }

  if (details.entity === 'holon' && details.operation === 'create') return 'Holon created';
  if (details.entity === 'holon' && details.operation === 'delete') return 'Holon removed';

  try
  {
    return JSON.stringify(details, null, 2);
  }
  catch
  {
    return String(details);
  }
}

function historyForHolon(changes)
{
  return (changes || []).filter(change =>
  {
    const provenance = change.provenance || {};
    if (String(provenance.status || '').toLowerCase() === 'pending') return false;
    const details = parseChange(provenance.changes);
    return String(details?.targetId || '') === String(selectedHolonId || '');
  });
}

function ensureStyles()
{
  if (document.getElementById('eb-provenance-history-style')) return;
  const style = document.createElement('style');
  style.id = 'eb-provenance-history-style';
  style.textContent = `
    .eb-provenance-section-title { margin: 4px 0 7px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; opacity: .72; }
    .eb-provenance-history-divider { margin: 12px 0; border: 0; border-top: 1px solid var(--eb-border, currentColor); opacity: .65; }
    .eb-provenance-history-item { padding: 8px 0; border-bottom: 1px solid var(--eb-border, currentColor); }
    .eb-provenance-history-status { font-weight: 600; }
  `;
  document.head.appendChild(style);
}

function addPendingHeading(panel)
{
  if (panel.querySelector('.eb-provenance-pending-title')) return;
  const title = document.createElement('div');
  title.className = 'eb-provenance-section-title eb-provenance-pending-title';
  title.textContent = 'Pending';
  panel.prepend(title);
}

function appendHistory(panel, history)
{
  panel.querySelector('.eb-provenance-history-divider')?.remove();
  panel.querySelector('.eb-provenance-history')?.remove();

  const divider = document.createElement('hr');
  divider.className = 'eb-provenance-history-divider';

  const section = document.createElement('section');
  section.className = 'eb-provenance-history';

  const heading = document.createElement('div');
  heading.className = 'eb-provenance-section-title';
  heading.textContent = 'History';
  section.appendChild(heading);

  if (!history.length)
  {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'No provenance history for this Holon.';
    section.appendChild(empty);
  }
  else
  {
    history.forEach(change =>
    {
      const provenance = change.provenance || {};
      const details = parseChange(provenance.changes);
      const item = document.createElement('article');
      item.className = 'eb-provenance-history-item';

      const title = document.createElement('div');
      title.className = 'eb-provenance-inspector-title';
      title.textContent = details?.operation === 'update' ? 'Holon updated' : `Holon ${details?.operation || 'changed'}`;

      const meta = document.createElement('div');
      meta.className = 'eb-provenance-inspector-meta';
      const status = provenance.status || 'complete';
      const timestamp = provenance.timestamp || change.created_at || '';
      const actor = provenance.actor || '';
      meta.innerHTML = `${timestamp} · ${actor} · <span class="eb-provenance-history-status">${status}</span>`;

      const changeText = document.createElement('pre');
      changeText.className = 'eb-provenance-inspector-change';
      changeText.textContent = humanizeChange(change);

      item.append(title, meta, changeText);
      section.appendChild(item);
    });
  }

  panel.append(divider, section);
}

async function renderHistory()
{
  if (rendering || !selectedHolonId) return;
  const panel = document.querySelector('#holonInspectorContent .eb-provenance-inspector');
  if (!panel || panel.hidden) return;

  const currentGeneration = ++generation;
  rendering = true;
  try
  {
    ensureStyles();
    addPendingHeading(panel);
    const changes = await eBliss.changes.list(null);
    if (currentGeneration !== generation || !panel.isConnected) return;
    appendHistory(panel, historyForHolon(changes));
  }
  catch (error)
  {
    if (currentGeneration !== generation || !panel.isConnected) return;
    appendHistory(panel, []);
    const history = panel.querySelector('.eb-provenance-history');
    const empty = history?.querySelector('.muted');
    if (empty) empty.textContent = error.message || 'Unable to load provenance history.';
  }
  finally
  {
    rendering = false;
  }
}

function scheduleRender()
{
  requestAnimationFrame(() => void renderHistory());
}

export function initProvenanceHistory()
{
  if (initialized) return;
  initialized = true;

  window.addEventListener('holon:selected', event =>
  {
    selectedHolonId = event.detail?.id ? String(event.detail.id) : null;
    generation++;
    scheduleRender();
  });

  document.addEventListener('click', event =>
  {
    const tab = event.target.closest?.('.eb-provenance-tab');
    if (!tab || tab.textContent?.trim() !== 'Prov') return;
    scheduleRender();
  });

  const content = document.getElementById('holonInspectorContent');
  if (content)
  {
    observer = new MutationObserver(() =>
    {
      if (!rendering) scheduleRender();
    });
    observer.observe(content, { childList: true, subtree: true });
  }
}
