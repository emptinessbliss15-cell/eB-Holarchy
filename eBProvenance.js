import { eBliss } from './eBSDK.js';

let container = null;

function escapeHtml(value)
{
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function prettyChanges(value)
{
  try { return JSON.stringify(typeof value === 'string' ? JSON.parse(value) : value, null, 2); }
  catch { return String(value ?? ''); }
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
  }
  catch (error) { list.className = 'eb-provenance-list'; list.textContent = error.message || 'Unable to load pending changes.'; }
}

export function initProvenance()
{
  render();
  window.addEventListener('eB:provenanceCreated', render);
  window.addEventListener('eB:modelChanged', render);
}

initProvenance();
