import { eBliss } from './eBSDK.js';
import { eBStatus } from './eBStatus.js';
import { showModal } from './eBModal.js';

let container = null;
let reviewDialog = null;
let reviewList = null;
let inspectorObserver = null;
let pendingTargets = new Map();
let pendingChanges = [];
let selectedHolonId = null;
let selectedHolon = null;
let inspectorTab = 'props';

function escapeHtml(value)
{
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function prettyChanges(value)
{
  try { return JSON.stringify(typeof value === 'string' ? JSON.parse(value) : value, null, 2); }
  catch { return String(value ?? ''); }
}

function parseChange(value)
{
  try { return typeof value === 'string' ? JSON.parse(value) : value; }
  catch { return null; }
}

async function refreshPendingTargets()
{
  try
  {
    const changes = await eBliss.changes.list('pending');
    pendingChanges = changes;
    pendingTargets = new Map();
    changes.forEach(change =>
    {
      const provenance = change.provenance || {};
      const details = parseChange(provenance.changes);
      const targetId = details?.targetId;
      if (!targetId || details?.entity !== 'holon') return;
      const keys = details?.operation === 'update' ? Object.keys(details.values || {}) : ['*'];
      const existing = pendingTargets.get(String(targetId)) || new Set();
      keys.forEach(key => existing.add(String(key).toLowerCase()));
      pendingTargets.set(String(targetId), existing);
    });
  }
  catch
  {
    pendingChanges = [];
    pendingTargets = new Map();
  }
}

function injectIndicatorStyles()
{
  if (document.getElementById('eb-provenance-indicator-style')) return;
  const style = document.createElement('style');
  style.id = 'eb-provenance-indicator-style';
  style.textContent = `
    .eb-provenance-indicator {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      margin-right: 5px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 13px;
      line-height: 1;
      vertical-align: -1px;
      opacity: .78;
      cursor: pointer;
    }
    .eb-provenance-indicator:hover { opacity: 1; }
    .eb-provenance-indicator:focus-visible { outline: 2px solid currentColor; outline-offset: 1px; }
    .eb-provenance-tabs { display: flex; gap: 4px; margin: 8px 0; border-bottom: 1px solid currentColor; }
    .eb-provenance-tab { border: 0; border-bottom: 2px solid transparent; background: transparent; padding: 5px 9px; cursor: pointer; color: inherit; opacity: .75; }
    .eb-provenance-tab:hover { opacity: 1; }
    .eb-provenance-tab.is-active { opacity: 1; border-bottom-color: currentColor; }
    .eb-provenance-tab:focus-visible { outline: 2px solid currentColor; outline-offset: 1px; }
    .eb-provenance-inspector { padding: 4px 0 8px; }
    .eb-provenance-inspector-item { padding: 8px 0; border-bottom: 1px solid currentColor; }
    .eb-provenance-inspector-title { font-weight: 600; margin-bottom: 3px; }
    .eb-provenance-inspector-meta { font-size: .85em; opacity: .75; margin-bottom: 5px; }
    .eb-provenance-inspector-change { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }

    .eb-provenance-panel {
      width: 100%;
      box-sizing: border-box;
      padding: 0;
      border: 0;
      background: transparent;
      box-shadow: none;
    }
    .eb-provenance-current {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 28px;
      padding: 4px 9px;
      border: 1px solid currentColor;
      border-radius: 6px;
      background: transparent;
      color: inherit;
      font: inherit;
      cursor: pointer;
      opacity: .82;
    }
    .eb-provenance-current:hover { opacity: 1; }
    .eb-provenance-current[hidden] { display: none; }
    .eb-provenance-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: 9px;
      background: currentColor;
    }
    .eb-provenance-count > span {
      color: Canvas;
      font-size: 11px;
      font-weight: 700;
    }
    .eb-provenance-review-dialog {
      width: min(680px, calc(100vw - 32px));
      max-height: min(760px, calc(100vh - 48px));
      padding: 0;
      border: 1px solid currentColor;
      border-radius: 8px;
      color: inherit;
      background: Canvas;
      overflow: hidden;
    }
    .eb-provenance-review-dialog::backdrop { background: rgb(0 0 0 / .28); }
    .eb-provenance-review-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
      border-bottom: 1px solid currentColor;
    }
    .eb-provenance-review-close {
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 20px;
      cursor: pointer;
    }
    .eb-provenance-list {
      max-height: calc(100vh - 120px);
      overflow: auto;
      padding: 0 12px 12px;
    }
    .eb-provenance-item {
      padding: 12px 0;
      border-bottom: 1px solid color-mix(in srgb, currentColor 22%, transparent);
    }
    .eb-provenance-item:last-child { border-bottom: 0; }
    .eb-provenance-title { font-weight: 600; }
    .eb-provenance-meta { margin-top: 2px; font-size: .82em; opacity: .68; }
    .eb-provenance-summary { margin: 8px 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    .eb-provenance-details { margin: 6px 0 10px; }
    .eb-provenance-details summary { cursor: pointer; opacity: .72; }
    .eb-provenance-changes { margin: 6px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    .eb-provenance-actions { display: flex; gap: 6px; }
  `;
  document.head.appendChild(style);
}

function hideLegacySchemaContent()
{
  const grid = document.querySelector('#holonInspector .holon-property-grid');
  if (!grid) return;
  const rows = [...grid.querySelectorAll('tbody tr')];
  const dynamicStart = rows.findIndex(row => row.classList.contains('eb-dynamic-field-start'));
  if (dynamicStart < 0) return;
  const contentRow = rows.findIndex((row, index) =>
  {
    if (index >= dynamicStart) return false;
    const label = row.querySelector('td');
    return label?.textContent?.trim() === 'Content';
  });
  if (contentRow >= 0) rows[contentRow].hidden = true;
}

async function addDynamicField()
{
  if (!selectedHolon?.holon_type) return;
  const typeOptions = [
    { value: 'text', label: 'Text (string)' },
    { value: 'number', label: 'Number' },
    { value: 'integer', label: 'Integer' },
    { value: 'boolean', label: 'Boolean' },
    { value: 'date', label: 'Date' },
    { value: 'datetime', label: 'Date & time' },
    { value: 'time', label: 'Time' },
    { value: 'json', label: 'JSON object' },
    { value: 'array', label: 'Array' },
    { value: 'uuid', label: 'UUID' },
    { value: 'reference', label: 'Holon reference' },
  ];
  const values = await showModal({
    title: `Add Field to ${selectedHolon.holon_type}`,
    submitLabel: 'Add Field',
    fields: [
      { name: 'name', label: 'Field name', type: 'text', value: '', required: true, placeholder: 'Field name' },
      { name: 'dataType', label: 'Value type', type: 'select', options: typeOptions, value: 'text' },
    ],
  });
  if (!values) return;
  const trimmed = String(values.name ?? '').trim();
  if (!trimmed) return;
  try
  {
    setStatus('Adding field…');
    await eBliss.fieldDefinitions.create(selectedHolon.holon_type, { name: trimmed, dataType: values.dataType || 'text' });
    setStatus(`Field ${trimmed} added`, 'success');
    window.dispatchEvent(new CustomEvent('eB:modelChanged', { detail: { fieldAdded: trimmed } }));
  }
  catch (error)
  {
    setStatus(error.message || 'Unable to add field', 'error');
  }
}

function addFieldControl(grid)
{
  if (!selectedHolon?.holon_type || grid.querySelector('.eb-add-dynamic-field')) return;
  const rows = [...grid.querySelectorAll('tbody tr')];
  const dynamicStart = rows.find(row => row.classList.contains('eb-dynamic-field-start'));
  if (!dynamicStart) return;
  const label = dynamicStart.querySelector('td');
  if (!label) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'eb-add-dynamic-field';
  button.setAttribute('aria-label', 'Add dynamic field');
  button.title = `Add field to ${selectedHolon.holon_type}`;
  button.textContent = '+';
  button.addEventListener('click', addDynamicField);
  label.prepend(button);
}

function injectFieldControlStyles()
{
  if (document.getElementById('eb-add-dynamic-field-style')) return;
  const style = document.createElement('style');
  style.id = 'eb-add-dynamic-field-style';
  style.textContent = `
    .eb-add-dynamic-field {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      margin-right: 5px;
      padding: 0;
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
      opacity: .78;
      vertical-align: -2px;
    }
    .eb-add-dynamic-field:hover { opacity: 1; }
    .eb-add-dynamic-field:focus-visible { outline: 2px solid currentColor; outline-offset: 1px; }
  `;
  document.head.appendChild(style);
}

function humanizeValue(value)
{
  if (value === undefined) return '—';
  if (value === null) return 'null';
  const text = String(value);
  try
  {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && parsed._eBFields) return '[dynamic fields]';
  }
  catch { }
  return text === '' ? 'empty' : text;
}

function humanizeChange(change)
{
  const details = parseChange(change?.provenance?.changes);
  if (!details) return prettyChanges(change?.provenance?.changes);
  const values = details.values || {};
  const entries = Object.entries(values);
  const entity = details.entity === 'relationship' ? 'Relationship' : 'Holon';

  if (details.operation === 'update')
  {
    if (details.entity !== 'holon') return `${entity} updated`;
    return entries.map(([key, value]) =>
    {
      const oldValue = change?.provenance?.previous?.[key] ?? change?.provenance?.oldValues?.[key];
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return `${label}: ${oldValue === undefined ? '(previous value unavailable)' : humanizeValue(oldValue)} → ${humanizeValue(value)}`;
    }).join('\n');
  }
  if (details.operation === 'delete') return `${entity} removed`;
  if (details.operation === 'create') return `${entity} created`;
  return prettyChanges(details);
}

function renderProvInspector(panel)
{
  panel.replaceChildren();
  const changes = pendingChanges.filter(change =>
  {
    const details = parseChange(change?.provenance?.changes);
    return String(details?.targetId || '') === String(selectedHolonId);
  });
  if (!changes.length)
  {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'No pending provenance changes for this Holon.';
    panel.appendChild(empty);
    return;
  }
  changes.forEach(change =>
  {
    const details = parseChange(change?.provenance?.changes);
    const item = document.createElement('article');
    item.className = 'eb-provenance-inspector-item';
    const title = document.createElement('div');
    title.className = 'eb-provenance-inspector-title';
    title.textContent = details?.operation === 'update' ? 'Holon updated' : `Holon ${details?.operation || 'changed'}`;
    const meta = document.createElement('div');
    meta.className = 'eb-provenance-inspector-meta';
    const p = change.provenance || {};
    meta.textContent = `${p.timestamp || change.created_at || ''} · ${p.actor || ''} · Pending`;
    const changeText = document.createElement('pre');
    changeText.className = 'eb-provenance-inspector-change';
    changeText.textContent = humanizeChange(change);
    item.append(title, meta, changeText);
    panel.appendChild(item);
  });
}

function ensureInspectorTabs(grid)
{
  if (!selectedHolonId || !grid) return;
  const content = document.getElementById('holonInspectorContent');
  if (!content || content.querySelector('.eb-provenance-tabs')) return;
  const tabs = document.createElement('div');
  tabs.className = 'eb-provenance-tabs';
  const props = document.createElement('button');
  props.type = 'button';
  props.className = 'eb-provenance-tab';
  props.textContent = 'Object Props';
  const prov = document.createElement('button');
  prov.type = 'button';
  prov.className = 'eb-provenance-tab';
  prov.textContent = 'Prov';
  const panel = document.createElement('div');
  panel.className = 'eb-provenance-inspector';

  const setTab = tab =>
  {
    inspectorTab = tab;
    props.classList.toggle('is-active', tab === 'props');
    prov.classList.toggle('is-active', tab === 'prov');
    grid.hidden = tab !== 'props';
    panel.hidden = tab !== 'prov';
    if (tab === 'prov') renderProvInspector(panel);
  };

  props.addEventListener('click', () => setTab('props'));
  prov.addEventListener('click', () => setTab('prov'));
  tabs.append(props, prov);
  grid.parentElement?.insertBefore(tabs, grid);
  grid.parentElement?.insertBefore(panel, grid.nextSibling);
  setTab(inspectorTab);
}

function openProvTab()
{
  inspectorTab = 'prov';
  requestAnimationFrame(decorateInspector);
}

function decorateInspector()
{
  const grid = document.querySelector('#holonInspector .holon-property-grid');
  if (!grid || !selectedHolonId) return;
  hideLegacySchemaContent();
  addFieldControl(grid);
  ensureInspectorTabs(grid);
  const keys = pendingTargets.get(String(selectedHolonId));
  if (!keys?.size) return;

  grid.querySelectorAll('tbody tr').forEach(row =>
  {
    if (row.hidden) return;
    const cells = row.querySelectorAll('td');
    if (cells.length < 2) return;
    const label = cells[0];
    const text = label.textContent?.trim() || '';
    if (!text || label.querySelector('.eb-provenance-indicator')) return;
    const key = text.toLowerCase().replace(/\s+/g, '_');
    if (!keys.has('*') && !keys.has(key) && !keys.has(text.toLowerCase())) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'eb-provenance-indicator';
    button.setAttribute('aria-label', `Pending provenance change for ${text}`);
    button.title = 'Pending change — provenance';
    button.textContent = 'ⓘ';
    button.addEventListener('click', event =>
    {
      event.preventDefault();
      event.stopPropagation();
      openProvTab();
    });
    label.prepend(button);
  });
}

function watchInspector()
{
  const target = document.getElementById('holonInspectorContent');
  if (!target) return;
  inspectorObserver?.disconnect();
  inspectorObserver = new MutationObserver(() => requestAnimationFrame(decorateInspector));
  inspectorObserver.observe(target, { childList: true, subtree: true });
  requestAnimationFrame(decorateInspector);
}

function closeReview()
{
  reviewDialog?.close();
}

function openReview()
{
  if (!pendingChanges.length || !reviewDialog) return;
  reviewDialog.showModal();
}

function ensureContainer()
{
  if (container?.isConnected) return container;
  const app = document.getElementById('app');
  if (!app?.parentElement) return null;

  container = document.createElement('section');
  container.className = 'eb-provenance-panel';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'eb-provenance-current';
  button.hidden = true;
  button.title = 'Review pending changes';
  button.addEventListener('click', openReview);

  const label = document.createElement('span');
  label.className = 'eb-provenance-current-label';
  label.textContent = 'Pending';

  const count = document.createElement('span');
  count.className = 'eb-provenance-count';
  count.innerHTML = '<span>0</span>';

  button.append(label, count);
  container.appendChild(button);
  app.parentElement.insertBefore(container, app);

  reviewDialog = document.createElement('dialog');
  reviewDialog.className = 'eb-provenance-review-dialog';

  const header = document.createElement('div');
  header.className = 'eb-provenance-review-header';

  const title = document.createElement('strong');
  title.textContent = 'Pending Changes';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'eb-provenance-review-close';
  closeButton.textContent = '×';
  closeButton.title = 'Close pending changes';
  closeButton.addEventListener('click', closeReview);

  header.append(title, closeButton);
  reviewList = document.createElement('div');
  reviewList.className = 'eb-provenance-list';
  reviewDialog.append(header, reviewList);
  document.body.appendChild(reviewDialog);

  reviewDialog.addEventListener('click', event =>
  {
    if (event.target === reviewDialog) closeReview();
  });

  return container;
}

function setPendingCount(count)
{
  const button = container?.querySelector('.eb-provenance-current');
  const countText = container?.querySelector('.eb-provenance-count > span');
  if (!button || !countText) return;
  button.hidden = count === 0;
  countText.textContent = String(count);
  button.setAttribute('aria-label', `${count} pending change${count === 1 ? '' : 's'}`);
}

function setActionBusy(card, action, busy)
{
  const buttons = card.querySelectorAll('.eb-provenance-actions button');
  buttons.forEach(button => { button.disabled = busy; });
  if (!action) return;
  action.textContent = busy ? (action.dataset.busyLabel || `${action.textContent}…`) : (action.dataset.defaultLabel || action.textContent);
}

async function render()
{
  ensureContainer();
  if (!reviewList) return;

  try
  {
    const changes = await eBliss.changes.list('pending');
    pendingChanges = changes;
    setPendingCount(changes.length);
    reviewList.replaceChildren();

    if (!changes.length)
    {
      closeReview();
      await refreshPendingTargets();
      decorateInspector();
      return;
    }

    changes.forEach(change =>
    {
      const card = document.createElement('article');
      card.className = 'eb-provenance-item';
      const p = change.provenance || {};
      const details = parseChange(p.changes);
      const entity = details?.entity === 'relationship' ? 'Relationship' : 'Holon';
      const operation = details?.operation ? details.operation[0].toUpperCase() + details.operation.slice(1) : 'Change';

      const title = document.createElement('div');
      title.className = 'eb-provenance-title';
      title.textContent = `${operation} ${entity}`;

      const meta = document.createElement('div');
      meta.className = 'eb-provenance-meta';
      meta.textContent = `${p.timestamp || change.created_at || ''} · ${p.actor || ''}`;

      const summary = document.createElement('div');
      summary.className = 'eb-provenance-summary';
      summary.textContent = humanizeChange(change) || change.name || 'Pending change';

      const detailsElement = document.createElement('details');
      detailsElement.className = 'eb-provenance-details';
      const detailsSummary = document.createElement('summary');
      detailsSummary.textContent = 'Raw change';
      const raw = document.createElement('pre');
      raw.className = 'eb-provenance-changes';
      raw.textContent = prettyChanges(p.changes);
      detailsElement.append(detailsSummary, raw);

      const actions = document.createElement('div');
      actions.className = 'eb-provenance-actions';
      const approveButton = document.createElement('button');
      approveButton.type = 'button';
      approveButton.dataset.action = 'approve';
      approveButton.dataset.defaultLabel = 'Approve';
      approveButton.dataset.busyLabel = '⟳ Approving…';
      approveButton.textContent = 'Approve';
      const rejectButton = document.createElement('button');
      rejectButton.type = 'button';
      rejectButton.dataset.action = 'reject';
      rejectButton.dataset.defaultLabel = 'Reject';
      rejectButton.dataset.busyLabel = '⟳ Rejecting…';
      rejectButton.textContent = 'Reject';
      actions.append(approveButton, rejectButton);

      approveButton.addEventListener('click', async () =>
      {
        setActionBusy(card, approveButton, true);
        try
        {
          await eBliss.changes.approve(change.id);
          setStatus('Change approved', 'success');
          await render();
          window.dispatchEvent(new CustomEvent('eB:modelChanged', { detail: { provenanceId: change.id, status: 'approved' } }));
        }
        catch (error)
        {
          setActionBusy(card, approveButton, false);
          setStatus(error.message || 'Unable to approve change', 'error');
        }
      });

      rejectButton.addEventListener('click', async () =>
      {
        setActionBusy(card, rejectButton, true);
        try
        {
          await eBliss.changes.reject(change.id);
          setStatus('Change rejected', 'success');
          await render();
        }
        catch (error)
        {
          setActionBusy(card, rejectButton, false);
          setStatus(error.message || 'Unable to reject change', 'error');
        }
      });

      card.append(title, meta, summary, detailsElement, actions);
      reviewList.appendChild(card);
    });

    await refreshPendingTargets();
    decorateInspector();
  }
  catch (error)
  {
    reviewList.className = 'eb-provenance-list';
    reviewList.textContent = error.message || 'Unable to load pending changes.';
    setStatus(error.message || 'Unable to load pending changes', 'error');
  }
}

function setStatus(text, level = 'info')
{
  try { eBStatus?.[level]?.(text); }
  catch { }
}

export function initProvenance()
{
  injectIndicatorStyles();
  injectFieldControlStyles();
  watchInspector();
  window.addEventListener('holon:selected', event =>
  {
    selectedHolonId = event.detail?.id ? String(event.detail.id) : null;
    selectedHolon = event.detail || null;
    inspectorTab = 'props';
    requestAnimationFrame(decorateInspector);
  });
  render();
  window.addEventListener('eB:provenanceCreated', render);
  window.addEventListener('eB:modelChanged', render);
}

initProvenance();

import('./eBHolarchyFilter.js').then(({ initHolarchyFilter }) => initHolarchyFilter());
