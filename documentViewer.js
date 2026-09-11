import { eBliss } from './eBSDK.js';
import { getHolonGraph } from './holonGraph.js';

const VIEW_KEY = 'eB-Holarchy.workspaceView';
const ROOT_KEY = 'eB-Holarchy.graphRoot';
const DOCUMENT_TYPES = new Set(['constitution', 'preamble', 'article', 'section', 'clause', 'content block']);

let model = { holons: [], relationships: [], relationshipTypes: [] };
let selectedId = null;

function stored(key, fallback = '') { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } }
function store(key, value) { try { localStorage.setItem(key, value); } catch {} }

function contentOf(holon) {
  const raw = holon?.Content ?? holon?.content ?? '';
  try {
    const parsed = JSON.parse(String(raw));
    if (parsed && typeof parsed === 'object') return String(parsed._legacyContent ?? '');
  } catch {}
  return String(raw || '');
}

function partOfTypeId() {
  return model.relationshipTypes.find(type => String(type.name || '').toLowerCase() === 'part of')?.id || null;
}

function childrenOf(parentId) {
  const typeId = partOfTypeId();
  if (!typeId) return [];
  return model.relationships
    .filter(rel => String(rel.relationship_type_id) === String(typeId) && String(rel.target_holon_id) === String(parentId))
    .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
    .map(rel => model.holons.find(holon => String(holon.id) === String(rel.source_holon_id)))
    .filter(Boolean);
}

function constitutionFor(id) {
  let current = model.holons.find(holon => String(holon.id) === String(id));
  const typeId = partOfTypeId();
  const seen = new Set();
  while (current && String(current.holon_type || '').toLowerCase() !== 'constitution' && !seen.has(String(current.id))) {
    seen.add(String(current.id));
    const parentRel = model.relationships.find(rel => String(rel.relationship_type_id) === String(typeId) && String(rel.source_holon_id) === String(current.id));
    current = parentRel ? model.holons.find(holon => String(holon.id) === String(parentRel.target_holon_id)) : null;
  }
  return current || null;
}

function headingLevel(type) {
  return ({ constitution: 1, preamble: 2, article: 2, section: 3, clause: 4 })[String(type || '').toLowerCase()] || 4;
}

function passage(node) {
  const type = String(node.holon_type || '').toLowerCase();
  const children = childrenOf(node.id);
  const wrapper = document.createElement(type === 'content block' ? 'p' : 'section');
  wrapper.className = `eb-document-passage eb-document-${type.replaceAll(' ', '-')}`;
  wrapper.dataset.holonId = node.id;
  wrapper.tabIndex = 0;

  if (type !== 'content block') {
    const heading = document.createElement(`h${headingLevel(type)}`);
    heading.textContent = node.name || '(unnamed)';
    wrapper.appendChild(heading);
  }

  const text = children.some(child => String(child.holon_type || '').toLowerCase() === 'content block') ? '' : contentOf(node);
  if (text) {
    const body = document.createElement(type === 'content block' ? 'span' : 'div');
    body.className = 'eb-document-text';
    body.textContent = text;
    wrapper.appendChild(body);
  }

  children.forEach(child => wrapper.appendChild(passage(child)));
  return wrapper;
}

function selectHolon(id, { fromGraph = false } = {}) {
  const item = document.querySelector(`[data-holon-id="${CSS.escape(String(id))}"]`);
  document.querySelectorAll('.eb-document-passage.is-selected').forEach(element => element.classList.remove('is-selected'));
  if (item) {
    item.classList.add('is-selected');
    item.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  selectedId = String(id);
  if (fromGraph) return;
  const holon = model.holons.find(candidate => String(candidate.id) === String(id));
  const cy = getHolonGraph();
  const node = cy?.getElementById?.(String(id));
  if (node?.nonempty?.()) { cy.elements().unselect(); node.select(); cy.animate({ center: { eles: node }, duration: 180 }); }
  if (holon) window.dispatchEvent(new CustomEvent('holon:selected', { detail: holon }));
}

function render() {
  const content = document.getElementById('documentViewerContent');
  const title = document.getElementById('documentViewerTitle');
  if (!content || !title) return;
  const rootId = stored(ROOT_KEY);
  const root = constitutionFor(rootId);
  content.replaceChildren();
  if (!root) {
    title.textContent = 'Document';
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'Choose a Constitution as the graph root.';
    content.appendChild(empty);
    return;
  }
  title.textContent = root.name || 'Document';
  content.appendChild(passage(root));
  if (selectedId) selectHolon(selectedId, { fromGraph: true });
}

function setView(view) {
  const workspace = document.querySelector('.workspace-primary');
  const graph = workspace?.querySelector('.panel-graph');
  const documentPanel = document.getElementById('documentViewer');
  if (!workspace || !graph || !documentPanel) return;
  const next = ['graph', 'split', 'document'].includes(view) ? view : 'split';
  workspace.dataset.view = next;
  graph.hidden = next === 'document';
  documentPanel.hidden = next === 'graph';
  document.querySelectorAll('#workspaceView [data-view]').forEach(button => {
    const active = button.dataset.view === next;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  store(VIEW_KEY, next);
  if (next !== 'document') setTimeout(() => getHolonGraph()?.resize?.(), 0);
}

async function refreshModel(nextModel = null) {
  try { model = nextModel || await eBliss.model.load(); render(); }
  catch (error) { window.ebStatus?.error?.(error?.message || 'Unable to load document'); }
}

export function initDocumentViewer() {
  const viewer = document.getElementById('documentViewerContent');
  if (!viewer || viewer.dataset.ready) return;
  viewer.dataset.ready = 'true';
  document.querySelectorAll('#workspaceView [data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
  viewer.addEventListener('click', event => { const item = event.target.closest('[data-holon-id]'); if (item) selectHolon(item.dataset.holonId); });
  viewer.addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-holon-id]')) { event.preventDefault(); selectHolon(event.target.dataset.holonId); } });
  window.addEventListener('holon:selected', event => { if (event.detail?.id && DOCUMENT_TYPES.has(String(event.detail.holon_type || '').toLowerCase())) selectHolon(event.detail.id, { fromGraph: true }); });
  window.addEventListener('eB:graphRootChanged', () => render());
  window.addEventListener('eB:modelLoaded', event => { if (event.detail?.model) void refreshModel(event.detail.model); });
  window.addEventListener('eB:modelChanged', () => void refreshModel());
  setView(stored(VIEW_KEY, 'split'));
  void refreshModel();
}
