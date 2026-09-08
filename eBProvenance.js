import { eBliss } from './eBSDK.js';

let container = null;
let inspectorObserver = null;
let pendingTargets = new Map();
let selectedHolonId = null;

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
  `;
  document.head.appendChild(style);
}

function decorateInspector()
{
  const grid = document.querySelector('#holonInspector .holon-property-grid');
  if (!grid || !selectedHolonId) return;
  const keys = pendingTargets.get(String(selectedHolonId));
  if (!keys?.size) return;

  grid.querySelectorAll('tbody tr').forEach(row =>
  {
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

function ensureContainer()
{
  if (container?.isConnected) return container;
  const workspace = document.querySelector('.workspace-primary');
  if (!workspace) return null;
  container = document.createElement('section');
  container.className = 'panel eb-provenance-panel';
  container.innerHTML = '<div class="panel-heading"><h3>Pending Changes</h3></div><div class="eb-provenance-list muted">Loading…</div>';
  workspace.parentElement?.insertBefore(container, workspace);
  return container;
}

async function render()
{
  const root = ensureContainer();
  if (!root) return;
  const list = root.querySelector('.eb-provenance-list');
  try
  {
    const changes = await eBliss.changes.list('pending');
    if (!changes.length)
    {
      list.className = 'eb-provenance-list muted';
      list.textContent = 'No pending changes.';
      await refreshPendingTargets();
      decorateInspector();
      return;
    }
    list.className = 'eb-provenance-list';
    list.replaceChildren();
    changes.forEach(change =>
    {
      const card = document.createElement('article');
      card.className = 'eb-provenance-item';
      const p = change.provenance || {};
      card.innerHTML = `<div class="eb-provenance-title">${escapeHtml(change.name || 'Pending change')}</div><div class="eb-provenance-meta">${escapeHtml(p.timestamp || change.created_at || '')} · ${escapeHtml(p.actor || '')}</div><pre class="eb-provenance-changes">${escapeHtml(prettyChanges(p.changes))}</pre><div class="eb-provenance-actions"><button type="button" data-action="approve">Approve</button><button type="button" data-action="reject">Reject</button></div>`;
      card.querySelector('[data-action="approve"]').addEventListener('click', async () =>
      {
        card.querySelectorAll('button').forEach(button => { button.disabled = true; });
        try { await eBliss.changes.approve(change.id); window.location.reload(); }
        catch (error) { card.querySelectorAll('button').forEach(button => { button.disabled = false; }); alert(error.message || 'Unable to approve change'); }
      });
      card.querySelector('[data-action="reject"]').addEventListener('click', async () =>
      {
        card.querySelectorAll('button').forEach(button => { button.disabled = true; });
        try { await eBliss.changes.reject(change.id); await render(); }
        catch (error) { card.querySelectorAll('button').forEach(button => { button.disabled = false; }); alert(error.message || 'Unable to reject change'); }
      });
      list.appendChild(card);
    });
    await refreshPendingTargets();
    decorateInspector();
  }
  catch (error) { list.className = 'eb-provenance-list'; list.textContent = error.message || 'Unable to load pending changes.'; }
}

export function initProvenance()
{
  injectIndicatorStyles();
  watchInspector();
  window.addEventListener('holon:selected', event =>
  {
    selectedHolonId = event.detail?.id ? String(event.detail.id) : null;
    requestAnimationFrame(decorateInspector);
  });
  render();
  window.addEventListener('eB:provenanceCreated', render);
  window.addEventListener('eB:modelChanged', render);
}

initProvenance();

import('./eBHolarchyFilter.js').then(({ initHolarchyFilter }) => initHolarchyFilter());
