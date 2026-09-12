import { eBliss } from './eBSDK.js';
import { mountDiscussionWorkspace } from './eBDiscussion.js';
import { getLoadedModel } from './holons.js';

const APP_NAME = 'eB Holarchy';
const DEFAULT_VIEW = 'holarchy';

const FALLBACK_VIEWS = [
  { id: 'holarchy', label: 'Holarchy', icon: '◎', position: 10 },
  { id: 'discuss', label: 'Discuss', icon: '💬', position: 20 },
  { id: 'settings', label: 'Settings', icon: '⚙', position: 30 },
  { id: 'groups', label: 'Groups', icon: '◉', position: 40 },
  { id: 'authority', label: 'Authority', icon: '⌘', position: 50 },
];

function slug(value)
{
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'view';
}

function parseContent(content)
{
  if (!content) return {};
  try
  {
    const parsed = JSON.parse(String(content));
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed.appView || parsed;
  }
  catch
  {
    return {};
  }
}

function relationshipName(relationship, relationshipTypes)
{
  if (relationship.relationship_type) return String(relationship.relationship_type);
  return relationshipTypes.find(type => String(type.id) === String(relationship.relationship_type_id))?.name || '';
}

function discoverViews(model)
{
  const { holons = [], relationships = [], relationshipTypes = [] } = model || {};
  const application = holons.find(holon =>
    String(holon.name || '').trim().toLowerCase() === APP_NAME.toLowerCase()
    && String(holon.holon_type || '').trim().toLowerCase() === 'app');

  if (!application) return [];

  const links = relationships.filter(relationship =>
  {
    if (String(relationship.target_holon_id) !== String(application.id)) return false;
    return relationshipName(relationship, relationshipTypes).trim().toLowerCase() === 'component of';
  });

  return links.map(link =>
  {
    const holon = holons.find(item => String(item.id) === String(link.source_holon_id));
    if (!holon || String(holon.holon_type || '').trim().toLowerCase() !== 'component') return null;
    const config = parseContent(holon.Content);
    return {
      holonId: holon.id,
      id: slug(config.route || config.id || holon.name),
      label: config.label || holon.name || 'View',
      icon: config.icon || '',
      position: Number(config.position ?? link.position ?? 0),
      enabled: config.enabled !== false,
    };
  })
    .filter(Boolean)
    .filter(view => view.enabled)
    .sort((a, b) => a.position - b.position || a.label.localeCompare(b.label));
}

function ensureStyles()
{
  if (document.getElementById('eb-app-bar-style')) return;
  const style = document.createElement('style');
  style.id = 'eb-app-bar-style';
  style.textContent = `
    .eb-app-bar { display:flex; align-items:center; gap:4px; min-height:38px; padding:4px 10px; border-bottom:1px solid var(--eb-border); background:var(--eb-bg); overflow-x:auto; }
    .eb-app-bar button { display:inline-flex; align-items:center; gap:6px; padding:6px 10px; border:1px solid transparent; border-radius:6px; background:transparent; color:var(--eb-text); cursor:pointer; white-space:nowrap; }
    .eb-app-bar button:hover { background:var(--eb-input-bg); border-color:var(--eb-border); }
    .eb-app-bar button[aria-current="page"] { background:var(--eb-input-bg); border-color:var(--eb-border-strong); font-weight:700; }
    .eb-app-view-placeholder { margin:12px; }
  `;
  document.head.appendChild(style);
}

function ensureViewElement(view)
{
  if (view.id === 'holarchy') return document.getElementById('app');
  const id = `appView-${view.id}`;
  let section = document.getElementById(id);
  if (section) return section;

  section = document.createElement('section');
  section.id = id;
  section.className = 'card eb-app-view-placeholder';
  section.hidden = true;
  section.dataset.ebAppView = view.id;

  if (view.id === 'discuss') {
    mountDiscussionWorkspace(section);
    document.querySelector('.eb-main')?.appendChild(section);
    return section;
  }

  const heading = document.createElement('h3');
  heading.textContent = view.label;
  section.appendChild(heading);

  const text = document.createElement('p');
  text.className = 'muted';
  text.textContent = `${view.label} is now an application view. Its contents can be built independently of the app bar.`;
  section.appendChild(text);

  document.querySelector('.eb-main')?.appendChild(section);
  return section;
}

function showView(viewId, views, root)
{
  for (const view of views)
  {
    const element = ensureViewElement(view);
    if (element) element.hidden = view.id !== viewId;
  }

  root.querySelectorAll('button[data-eb-app-view]').forEach(button =>
  {
    if (button.dataset.ebAppView === viewId) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });

  try { localStorage.setItem('eB-Holarchy.appView', viewId); } catch { }
  window.dispatchEvent(new CustomEvent('eB:appViewChanged', { detail: { viewId } }));
}

function storedView(views)
{
  let value = '';
  try { value = localStorage.getItem('eB-Holarchy.appView') || ''; } catch { }
  return views.some(view => view.id === value) ? value : DEFAULT_VIEW;
}

export async function initAppBar()
{
  const root = document.getElementById('appBar');
  if (!root) return null;
  ensureStyles();

  let views = [];
  try
  {
    views = discoverViews(getLoadedModel() || await eBliss.model.load());
  }
  catch (error)
  {
    console.warn('Unable to load holon-defined app bar; using fallback views.', error);
  }

  if (!views.length) views = FALLBACK_VIEWS.map(view => ({ ...view }));
  if (!views.some(view => view.id === DEFAULT_VIEW)) views.unshift({ ...FALLBACK_VIEWS[0] });
  if (!views.some(view => view.id === 'discuss')) views.push({ ...FALLBACK_VIEWS.find(view => view.id === 'discuss') });
  views.sort((a, b) => a.position - b.position || a.label.localeCompare(b.label));

  root.className = 'eb-app-bar';
  root.replaceChildren();

  for (const view of views)
  {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.ebAppView = view.id;
    button.title = view.label;

    if (view.icon)
    {
      const icon = document.createElement('span');
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = view.icon;
      button.appendChild(icon);
    }

    const label = document.createElement('span');
    label.textContent = view.label;
    button.appendChild(label);
    button.addEventListener('click', () => showView(view.id, views, root));
    root.appendChild(button);
  }

  showView(storedView(views), views, root);

  const api = Object.freeze({
    views: () => views.map(view => ({ ...view })),
    show: viewId => showView(viewId, views, root),
  });
  window.ebAppBar = api;
  return api;
}
