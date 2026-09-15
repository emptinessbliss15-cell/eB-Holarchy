import { createEBAddButton } from './eBAddButton.js';

const STRUCTURAL_NAMES = new Set([
  'circle of', 'subcircle of', 'role of', 'member of', 'part of', 'belongs to',
  'contained by', 'within', 'accountability of',
]);
const INVERSE_STRUCTURAL_NAMES = new Set(['contains', 'includes', 'has circle', 'has role']);

function text(value) { return String(value ?? '').trim(); }
function normalized(value) { return text(value).toLowerCase(); }
function typeOf(holon) { return text(holon?.holon_type || holon?.holon_type_name || 'Holon'); }
function isCircle(holon) { return ['circle', 'company'].includes(normalized(typeOf(holon))); }
function isRole(holon) { return normalized(typeOf(holon)) === 'role'; }
function statusOf(holon) { return normalized(holon?.status || 'current').replaceAll('_', ' '); }

function contentOf(holon) {
  for (const key of ['Purpose', 'purpose', 'Description', 'description', 'Content', 'content']) {
    if (text(holon?.[key])) return text(holon[key]);
  }
  return '';
}

function relationshipName(relationship, types) {
  return text(relationship.relationship_type || relationship.relationship_type_name ||
    types.find(type => String(type.id) === String(relationship.relationship_type_id))?.name || 'relationship');
}

function makeButton(label, className, onClick) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = className; button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

export function renderCircleView({ container, context, holons = [], relationships = [], relationshipTypes = [], onOpen, onOperate, onCreate, onCreateRelationship, onEdit, onDelete } = {}) {
  if (!container) return;
  container._ebCircleAddButton?.destroy?.();
  container._ebCircleContextCleanup?.();
  container.replaceChildren();
  const byId = new Map(holons.map(holon => [String(holon.id), holon]));
  const active = context && byId.get(String(context.id));

  const heading = document.createElement('div'); heading.className = 'panel-heading eb-circle-heading';
  const title = document.createElement('h3'); title.textContent = 'Circles';
  const headingActions = document.createElement('div'); headingActions.className = 'eb-circle-heading-actions';
  const scope = document.createElement('span'); scope.className = 'muted'; scope.textContent = active ? `within ${active.name}` : 'choose an operating context';
  headingActions.appendChild(scope); heading.append(title, headingActions); container.appendChild(heading);
  if (!active) {
    const empty = document.createElement('div'); empty.className = 'eb-operating-empty';
    empty.textContent = 'Choose a Company or Circle above, or use “Operate within” on a Holon.';
    container.appendChild(empty); return;
  }

  const namedRelationships = relationships.map(relationship => ({ relationship, name: normalized(relationshipName(relationship, relationshipTypes)) }));
  const candidatesByParent = new Map();
  for (const item of namedRelationships) {
    const source = byId.get(String(item.relationship.source_holon_id));
    const target = byId.get(String(item.relationship.target_holon_id));
    if (!source || !target) continue;

    const inverse = INVERSE_STRUCTURAL_NAMES.has(item.name);
    let child = inverse ? target : source;
    let parent = inverse ? source : target;

    // A Role is always contained by a Circle. Infer that containment from node
    // types so Circle view remains correct even when the relationship is stored
    // in the opposite endpoint direction.
    if (isRole(source) && isCircle(target)) {
      child = source;
      parent = target;
    } else if (isCircle(source) && isRole(target)) {
      child = target;
      parent = source;
    }

    if ((!isCircle(child) && !isRole(child)) || !isCircle(parent)) continue;
    const key = String(parent.id);
    if (!candidatesByParent.has(key)) candidatesByParent.set(key, []);
    candidatesByParent.get(key).push({ ...item, child, parent, structural: STRUCTURAL_NAMES.has(item.name) || inverse });
  }
  const childrenByParent = new Map();
  for (const [key, candidates] of candidatesByParent) {
    const structural = candidates.filter(item => item.structural);
    const chosen = structural.length ? structural : candidates;
    childrenByParent.set(key, chosen.map(item => item.child).filter((child, index, all) => all.findIndex(item => String(item.id) === String(child.id)) === index));
  }
  const parentEntry = [...childrenByParent.entries()].find(([, children]) => children.some(child => String(child.id) === String(active.id)));
  const parent = parentEntry ? byId.get(parentEntry[0]) : null;
  if (parent && String(parent.id) !== String(active.id)) {
    headingActions.prepend(makeButton(`↑ Up to ${parent.name || '(unnamed)'}`, 'eb-circle-up', () => onOperate?.(parent)));
  }
  const addHost = document.createElement('div');
  headingActions.appendChild(addHost);
  container._ebCircleAddButton = createEBAddButton(addHost, { label: `Add within ${active.name || 'circle'}…`, items: [
    { label: 'Circle', onSelect: () => onCreate?.('Circle', active) },
    { label: 'Role', onSelect: () => onCreate?.('Role', active) },
    { label: 'Tension', onSelect: () => onCreate?.('Tension', active) },
    { label: 'Process', onSelect: () => onCreate?.('Process', active) },
    { label: 'Node', onSelect: () => onCreate?.('', active) },
    { label: 'Relationship', onSelect: () => onCreateRelationship?.(active) },
  ] });

  const layout = document.createElement('div'); layout.className = 'eb-circle-layout';
  const canvas = document.createElement('div'); canvas.className = 'eb-circle-canvas';
  const detail = document.createElement('aside'); detail.className = 'eb-circle-detail'; detail.setAttribute('aria-live', 'polite');
  layout.append(canvas, detail); container.appendChild(layout);

  let contextMenu = null;
  const contextController = new AbortController();
  function closeContextMenu() { contextMenu?.remove(); contextMenu = null; }
  function selectCircle(node, holon) {
    canvas.querySelectorAll('.is-selected').forEach(item => item.classList.remove('is-selected'));
    node.classList.add('is-selected');
    renderDetail(holon);
  }
  function showCircleContextMenu(holon, node, x, y) {
    closeContextMenu();
    selectCircle(node, holon);
    const menu = document.createElement('div');
    menu.className = 'eb-context-menu eb-circle-context-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', `Actions for ${holon.name || 'circle'}`);
    const add = (label, action, danger = false) => {
      const button = makeButton(label, danger ? 'danger' : '', event => { closeContextMenu(); action(event); });
      button.setAttribute('role', 'menuitem');
      menu.appendChild(button);
    };
    const separator = document.createElement('div'); separator.className = 'context-separator'; separator.setAttribute('role', 'separator');
    add('Open in Graph', () => onOpen?.(holon));
    if (String(holon.id) !== String(active.id)) add('Operate within', () => onOperate?.(holon));
    add('Add Subcircle', () => onCreate?.('Circle', holon));
    add('Add Role', () => onCreate?.('Role', holon));
    add('Add Tension', () => onCreate?.('Tension', holon));
    add('Add Process', () => onCreate?.('Process', holon));
    add('Add Relationship', () => onCreateRelationship?.(holon));
    menu.appendChild(separator);
    add('Edit Properties', () => onEdit?.(holon));
    add('Delete Circle', () => onDelete?.(holon), true);
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
    contextMenu = menu;
    menu.querySelector('button')?.focus();
  }
  document.addEventListener('pointerdown', event => { if (!contextMenu?.contains(event.target)) closeContextMenu(); }, { signal: contextController.signal });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeContextMenu(); }, { signal: contextController.signal });
  container._ebCircleContextCleanup = () => { contextController.abort(); closeContextMenu(); };

  function renderDetail(holon) {
    detail.replaceChildren();
    const name = document.createElement('h4'); name.textContent = holon.name || '(unnamed)';
    const meta = document.createElement('div'); meta.className = 'eb-circle-detail-meta'; meta.textContent = `${typeOf(holon)} · ${statusOf(holon)}`;
    detail.append(name, meta);
    const content = contentOf(holon);
    if (content) { const purpose = document.createElement('p'); purpose.textContent = content; detail.appendChild(purpose); }
    const connected = relationships.filter(rel => String(rel.source_holon_id) === String(holon.id) || String(rel.target_holon_id) === String(holon.id));
    const relationTitle = document.createElement('h5'); relationTitle.textContent = `Relationships (${connected.length})`; detail.appendChild(relationTitle);
    const relationList = document.createElement('ul');
    for (const rel of connected.slice(0, 18)) {
      const outgoing = String(rel.source_holon_id) === String(holon.id);
      const other = byId.get(String(outgoing ? rel.target_holon_id : rel.source_holon_id));
      const item = document.createElement('li');
      item.textContent = `${outgoing ? '→' : '←'} ${relationshipName(rel, relationshipTypes)} · ${other?.name || '(unknown)'}`;
      relationList.appendChild(item);
    }
    if (connected.length > 18) { const item = document.createElement('li'); item.textContent = `+ ${connected.length - 18} more`; relationList.appendChild(item); }
    detail.appendChild(relationList);
    const actions = document.createElement('div'); actions.className = 'eb-circle-detail-actions';
    actions.appendChild(makeButton('Edit', '', () => onEdit?.(holon)));
    actions.appendChild(makeButton('Open in Graph', '', () => onOpen?.(holon)));
    if (isCircle(holon) && String(holon.id) !== String(active.id)) actions.appendChild(makeButton('Operate within', '', () => onOperate?.(holon)));
    detail.appendChild(actions);
  }

  function descendantsCount(id, visited = new Set()) {
    const key = String(id); if (visited.has(key)) return 0; visited.add(key);
    return (childrenByParent.get(key) || []).reduce((count, child) => count + 1 + (isCircle(child) ? descendantsCount(child.id, visited) : 0), 0);
  }

  function circleNode(holon, ancestors = new Set()) {
    const id = String(holon.id);
    const node = document.createElement('section'); node.className = `eb-org-circle${normalized(typeOf(holon)) === 'company' ? ' is-company' : ''}`;
    node.tabIndex = 0; node.dataset.holonId = id; node.style.setProperty('--circle-weight', Math.min(descendantsCount(id), 18));
    const children = childrenByParent.get(id) || [];
    const circles = children.filter(isCircle).sort((a, b) => text(a.name).localeCompare(text(b.name)));
    const roles = children.filter(isRole).sort((a, b) => text(a.name).localeCompare(text(b.name)));
    const label = document.createElement('button'); label.type = 'button'; label.className = 'eb-org-circle-label'; label.textContent = holon.name || '(unnamed)';
    label.title = `${typeOf(holon)} · ${circles.length} subcircles · ${roles.length} roles`;
    label.addEventListener('click', event => { event.stopPropagation(); selectCircle(node, holon); });
    label.addEventListener('dblclick', event => { event.stopPropagation(); onOperate?.(holon); });
    node.addEventListener('contextmenu', event => {
      event.preventDefault(); event.stopPropagation();
      showCircleContextMenu(holon, node, event.clientX, event.clientY);
    });
    const stats = document.createElement('div'); stats.className = 'eb-org-circle-stats'; stats.textContent = `${circles.length} circles · ${roles.length} roles`;
    const contents = document.createElement('div'); contents.className = 'eb-org-circle-contents';
    for (const role of roles) {
      const roleButton = makeButton(role.name || '(unnamed)', `eb-role-bubble status-${statusOf(role).replaceAll(' ', '-')}`, event => {
        event.stopPropagation(); canvas.querySelectorAll('.is-selected').forEach(item => item.classList.remove('is-selected')); roleButton.classList.add('is-selected'); renderDetail(role);
      });
      roleButton.title = `${typeOf(role)} · ${statusOf(role)}`; contents.appendChild(roleButton);
    }
    if (!ancestors.has(id)) {
      const nextAncestors = new Set(ancestors); nextAncestors.add(id);
      for (const child of circles) contents.appendChild(circleNode(child, nextAncestors));
    }
    if (!children.length) { const empty = document.createElement('span'); empty.className = 'eb-circle-empty'; empty.textContent = 'No circles or roles'; contents.appendChild(empty); }
    node.append(label, stats, contents); return node;
  }

  canvas.appendChild(circleNode(active));
  renderDetail(active);
}
