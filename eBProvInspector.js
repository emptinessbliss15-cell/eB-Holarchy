import { eBliss } from './eBSDK.js';

let selectedHolonId = null;
let renderToken = 0;

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
  if (!details) return 'Change details unavailable';

  if (details.entity === 'holon')
  {
    if (details.operation === 'update')
    {
      return Object.entries(details.values || {}).map(([key, value]) =>
      {
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
        return `${label}: ${humanizeValue(value)}`;
      }).join('\n') || 'Holon updated';
    }
    if (details.operation === 'delete') return 'Holon removed';
    if (details.operation === 'create') return 'Holon created';
  }

  if (details.entity === 'relationship')
  {
    return `Relationship ${details.operation || 'changed'}`;
  }

  return `${details.entity || 'Object'} ${details.operation || 'changed'}`;
}

function belongsToSelectedHolon(change)
{
  const details = parseChange(change?.provenance?.changes);
  if (!details || !selectedHolonId) return false;
  return String(details.targetId || '') === String(selectedHolonId);
}

function renderItem(change)
{
  const item = document.createElement('article');
  item.className = 'eb-prov-history-item';

  const details = parseChange(change?.provenance?.changes);
  const provenance = change?.provenance || {};
  const title = document.createElement('div');
  title.className = 'eb-prov-history-title';
  title.textContent = details?.operation ? `${details.operation[0].toUpperCase()}${details.operation.slice(1)}` : 'Change';

  const meta = document.createElement('div');
  meta.className = 'eb-prov-history-meta';
  const timestamp = provenance.timestamp || change.created_at || '';
  const actor = provenance.actor || '';
  const status = provenance.status || '';
  meta.textContent = [timestamp, actor, status].filter(Boolean).join(' · ');

  const body = document.createElement('pre');
  body.className = 'eb-prov-history-change';
  body.textContent = humanizeChange(change);

  item.append(title, meta, body);
  return item;
}

function renderSection(titleText, changes, emptyText)
{
  const section = document.createElement('section');
  section.className = 'eb-prov-history-section';

  const title = document.createElement('h4');
  title.className = 'eb-prov-history-heading';
  title.textContent = titleText;
  section.appendChild(title);

  if (!changes.length)
  {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = emptyText;
    section.appendChild(empty);
    return section;
  }

  changes.forEach(change => section.appendChild(renderItem(change)));
  return section;
}

function provPanel()
{
  return document.querySelector('#holonInspectorContent .eb-provenance-inspector');
}

async function render()
{
  const token = ++renderToken;
  const panel = provPanel();
  if (!panel || !selectedHolonId || panel.hidden) return;

  panel.replaceChildren();
  const loading = document.createElement('div');
  loading.className = 'muted';
  loading.textContent = 'Loading provenance…';
  panel.appendChild(loading);

  try
  {
    const changes = await eBliss.changes.list('');
    if (token !== renderToken) return;

    const related = (changes || []).filter(belongsToSelectedHolon);
    const pending = related.filter(change => String(change?.provenance?.status || '').toLowerCase() === 'pending');
    const history = related.filter(change => String(change?.provenance?.status || '').toLowerCase() !== 'pending');

    panel.replaceChildren();
    panel.appendChild(renderSection('Pending', pending, 'No pending changes.'));

    const divider = document.createElement('hr');
    divider.className = 'eb-prov-history-divider';
    panel.appendChild(divider);

    panel.appendChild(renderSection('History', history, 'No provenance history yet.'));
  }
  catch (error)
  {
    panel.replaceChildren();
    const message = document.createElement('div');
    message.className = 'muted';
    message.textContent = error.message || 'Unable to load provenance history.';
    panel.appendChild(message);
  }
}

function injectStyles()
{
  if (document.getElementById('eb-prov-history-style')) return;
  const style = document.createElement('style');
  style.id = 'eb-prov-history-style';
  style.textContent = `
    .eb-prov-history-section { padding: 2px 0 6px; }
    .eb-prov-history-heading { margin: 4px 0 8px; font-size: 13px; }
    .eb-prov-history-divider { border: 0; border-top: 1px solid currentColor; opacity: .25; margin: 12px 0; }
    .eb-prov-history-item { padding: 8px 0; border-bottom: 1px solid color-mix(in srgb, currentColor 20%, transparent); }
    .eb-prov-history-item:last-child { border-bottom: 0; }
    .eb-prov-history-title { font-weight: 600; text-transform: capitalize; }
    .eb-prov-history-meta { margin: 3px 0 5px; font-size: .82em; opacity: .7; overflow-wrap: anywhere; }
    .eb-prov-history-change { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; font-size: .9em; }
  `;
  document.head.appendChild(style);
}

export function initProvInspector()
{
  injectStyles();

  window.addEventListener('holon:selected', event =>
  {
    selectedHolonId = event.detail?.id ? String(event.detail.id) : null;
  });

  document.addEventListener('click', event =>
  {
    const tab = event.target.closest?.('.eb-provenance-tab');
    if (!tab || tab.textContent?.trim() !== 'Prov') return;
    setTimeout(() => void render(), 0);
  });

  window.addEventListener('eB:modelChanged', () =>
  {
    if (!provPanel()?.hidden) void render();
  });

  window.addEventListener('eB:provenanceCreated', () =>
  {
    if (!provPanel()?.hidden) void render();
  });
}

initProvInspector();
