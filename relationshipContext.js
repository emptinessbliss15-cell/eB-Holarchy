// Relationship graph context actions.
// Extends the graph's relationship context menu and owns relationship-specific drag/drop behavior.

import { eBliss } from './eBSDK.js';
import { getHolonGraph } from './holonGraph.js';
import { eBStatus } from './eBStatus.js';
import { showModal } from './eBModal.js';
import { eBConfirm } from './eBConfirm.js';

let attachedGraph = null;
let contextHandler = null;
let nodeContextHandler = null;
let grabHandler = null;
let freeHandler = null;
let draggedNodeId = null;
let resizeObserver = null;
let resizeFrame = 0;
let windowResizeHandler = null;
let dropMenu = null;

async function reverseRelationship(relationship) {
  if (!relationship?.id) return;
  const source = relationship.source_holon_id;
  const target = relationship.target_holon_id;
  if (!source || !target) { eBStatus.warn('Relationship source and target are required'); return; }
  eBStatus.info('Reversing relationship…');
  try {
    await eBliss.relationships.update(relationship.id, { source_holon_id: target, target_holon_id: source });
    eBStatus.success('Relationship reversed');
  } catch (error) { eBStatus.error(error?.message || 'Unable to reverse relationship'); }
}

function sortedHolonOptions(holons) {
  return holons
    .filter(holon => String(holon.holon_type || '').toLowerCase() !== 'provenance')
    .map(holon => ({ value: holon.id, label: holon.name || '(unnamed)' }))
    .sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { sensitivity: 'base' }));
}

function sortedRelationshipTypeOptions(relationshipTypes) {
  return relationshipTypes
    .map(type => ({ value: type.id, label: type.name || '(unnamed)' }))
    .sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { sensitivity: 'base' }));
}

async function createContextRelationship(sourceId) {
  if (!sourceId) return;
  let model;
  try { model = await eBliss.model.load(); }
  catch (error) { eBStatus.error(error?.message || 'Unable to load relationship data'); return; }
  const holons = model?.holons || [];
  const relationshipTypes = model?.relationshipTypes || [];
  const source = holons.find(item => String(item.id) === String(sourceId));
  if (!source) return;
  if (holons.length < 2 || !relationshipTypes.length) { eBStatus.warn('Need at least two Holons and one relationship type'); return; }
  const holonOptions = sortedHolonOptions(holons);
  const values = await showModal({
    title: 'New Relationship', submitLabel: 'Create Relationship', fields: [
      { name: 'source_holon_id', label: 'Source Holon', type: 'select', options: holonOptions, value: source.id, required: true },
      { name: 'relationship_type_id', label: 'Relationship', type: 'select', options: sortedRelationshipTypeOptions(relationshipTypes), required: true },
      { name: 'target_holon_id', label: 'Target Holon', type: 'select', options: holonOptions, required: true },
      { name: 'position', label: 'Position', type: 'number', value: '0' },
    ],
  });
  if (!values) return;
  eBStatus.info('Creating relationship…');
  try {
    await eBliss.relationships.create({ source_holon_id: values.source_holon_id, relationship_type_id: values.relationship_type_id, target_holon_id: values.target_holon_id, position: Number(values.position) || 0 });
    eBStatus.success('Relationship created');
    window.dispatchEvent(new CustomEvent('eB:modelChanged'));
  } catch (error) { eBStatus.error(error?.message || 'Unable to create relationship'); }
}

async function createDroppedRelationship(sourceId, targetId) {
  if (!sourceId || !targetId || String(sourceId) === String(targetId)) return;
  let model;
  try { model = await eBliss.model.load(); }
  catch (error) { eBStatus.error(error?.message || 'Unable to load relationship types'); return; }
  const holons = model?.holons || [];
  const relationshipTypes = model?.relationshipTypes || [];
  const source = holons.find(item => String(item.id) === String(sourceId));
  const target = holons.find(item => String(item.id) === String(targetId));
  if (!source || !target) return;
  if (!relationshipTypes.length) { eBStatus.warn('No relationship types are available'); return; }
  const values = await showModal({
    title: `Relate ${source.name || '(unnamed)'} → ${target.name || '(unnamed)'}`,
    submitLabel: 'Create Relationship',
    fields: [
      { name: 'relationship_type_id', label: 'Relationship', type: 'select', options: sortedRelationshipTypeOptions(relationshipTypes), required: true },
      { name: 'position', label: 'Position', type: 'number', value: '0' },
    ],
  });
  if (!values?.relationship_type_id) return;
  eBStatus.info(`Creating ${source.name || 'Holon'} → ${target.name || 'Holon'} relationship…`);
  try {
    await eBliss.relationships.create({ source_holon_id: source.id, relationship_type_id: values.relationship_type_id, target_holon_id: target.id, position: Number(values.position) || 0 });
    eBStatus.success('Relationship created');
    window.dispatchEvent(new CustomEvent('eB:modelChanged'));
  } catch (error) { eBStatus.error(error?.message || 'Unable to create relationship'); }
}

async function replaceHolon(replacementId, replacedId, point = {}) {
  if (!replacementId || !replacedId || String(replacementId) === String(replacedId)) return;
  let model;
  try { model = await eBliss.model.load(); }
  catch (error) { eBStatus.error(error?.message || 'Unable to load Holons for replacement'); return; }
  const holons = model?.holons || [];
  const relationships = model?.relationships || [];
  const replacement = holons.find(item => String(item.id) === String(replacementId));
  const replaced = holons.find(item => String(item.id) === String(replacedId));
  if (!replacement || !replaced) return;

  const confirmed = await eBConfirm({
    title: 'Replace Holon',
    message: `Replace “${replaced.name || '(unnamed)'}” with “${replacement.name || '(unnamed)'}”? Relationships connected to the replaced Holon will be redirected to the dragged Holon, then the replaced Holon will be deleted.`,
    confirmLabel: 'Replace', x: point.x, y: point.y,
  });
  if (!confirmed) return;

  const affected = relationships.filter(rel => String(rel.source_holon_id) === String(replaced.id) || String(rel.target_holon_id) === String(replaced.id));
  eBStatus.info(`Replacing ${replaced.name || 'Holon'} with ${replacement.name || 'Holon'}…`);
  try {
    for (const relationship of affected) {
      const nextSource = String(relationship.source_holon_id) === String(replaced.id) ? replacement.id : relationship.source_holon_id;
      const nextTarget = String(relationship.target_holon_id) === String(replaced.id) ? replacement.id : relationship.target_holon_id;
      // A redirected relationship that would point the survivor to itself has no useful structural meaning.
      if (String(nextSource) === String(nextTarget)) {
        await eBliss.relationships.delete(relationship.id);
        continue;
      }
      await eBliss.relationships.update(relationship.id, { source_holon_id: nextSource, target_holon_id: nextTarget });
    }
    await eBliss.holons.delete(replaced.id);
    eBStatus.success(`Replaced ${replaced.name || 'Holon'} with ${replacement.name || 'Holon'}`);
    window.dispatchEvent(new CustomEvent('eB:modelChanged'));
  } catch (error) {
    eBStatus.error(error?.message || 'Unable to replace Holon');
    window.dispatchEvent(new CustomEvent('eB:modelChanged'));
  }
}

function closeDropMenu() {
  dropMenu?.remove();
  dropMenu = null;
}

function showDropActionMenu(sourceId, targetId, point = {}) {
  closeDropMenu();
  const menu = document.createElement('div');
  menu.className = 'holon-context-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Holon drop action');
  const add = (label, action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('role', 'menuitem');
    button.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation(); closeDropMenu(); action();
    });
    menu.appendChild(button);
  };
  add('Relate', () => void createDroppedRelationship(sourceId, targetId));
  add('Replace', () => void replaceHolon(sourceId, targetId, point));
  add('Cancel', closeDropMenu);
  document.body.appendChild(menu);
  dropMenu = menu;

  const rect = menu.getBoundingClientRect();
  const x = Number.isFinite(point.x) ? point.x : window.innerWidth / 2;
  const y = Number.isFinite(point.y) ? point.y : window.innerHeight / 2;
  menu.style.left = `${Math.max(8, Math.min(x + 8, window.innerWidth - rect.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y + 8, window.innerHeight - rect.height - 8))}px`;
  const outside = event => { if (!menu.contains(event.target)) { closeDropMenu(); document.removeEventListener('pointerdown', outside, true); } };
  requestAnimationFrame(() => document.addEventListener('pointerdown', outside, true));
}

function overlapArea(a, b) {
  const width = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const height = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  return width * height;
}

function scheduleGraphResize(graph) {
  if (!graph) return;
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => { graph.resize(); resizeFrame = requestAnimationFrame(() => graph.resize()); });
}

function installDimensionSync(graph) {
  resizeObserver?.disconnect();
  if (windowResizeHandler) window.removeEventListener('resize', windowResizeHandler);
  const container = graph?.container?.();
  if (!container) return;
  resizeObserver = new ResizeObserver(() => scheduleGraphResize(graph));
  resizeObserver.observe(container);
  if (container.parentElement) resizeObserver.observe(container.parentElement);
  windowResizeHandler = () => scheduleGraphResize(graph);
  window.addEventListener('resize', windowResizeHandler, { passive: true });
  scheduleGraphResize(graph);
}

function addReverseMenuItem(menu, relationship) {
  if (!menu || menu.querySelector('[data-eb-action="reverse-relationship"]')) return;
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = 'Reverse'; button.dataset.ebAction = 'reverse-relationship'; button.setAttribute('role', 'menuitem');
  button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); menu.remove(); void reverseRelationship(relationship); });
  const deleteButton = [...menu.querySelectorAll('button')].find(item => item.textContent?.trim() === 'Delete Relationship');
  if (deleteButton) menu.insertBefore(button, deleteButton); else menu.appendChild(button);
}

function replaceNodeRelationshipMenuAction(menu, sourceId) {
  if (!menu || !sourceId) return;
  const original = [...menu.querySelectorAll('button')].find(item => item.textContent?.trim() === 'New Relationship');
  if (!original || original.dataset.ebContextSource === String(sourceId)) return;
  const replacement = original.cloneNode(true);
  replacement.dataset.ebContextSource = String(sourceId);
  replacement.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); menu.remove(); void createContextRelationship(sourceId); });
  original.replaceWith(replacement);
}

function attach() {
  const graph = getHolonGraph();
  if (!graph) return;
  if (graph === attachedGraph) { scheduleGraphResize(graph); return; }
  if (attachedGraph) {
    if (contextHandler) attachedGraph.off('cxttap', 'edge', contextHandler);
    if (nodeContextHandler) attachedGraph.off('cxttap', 'node', nodeContextHandler);
    if (grabHandler) attachedGraph.off('grab', 'node', grabHandler);
    if (freeHandler) attachedGraph.off('free', 'node', freeHandler);
  }
  contextHandler = event => {
    const relationship = event.target?.data?.('relationship');
    if (!relationship) return;
    queueMicrotask(() => addReverseMenuItem(document.querySelector('.holon-context-menu'), relationship));
  };
  nodeContextHandler = event => {
    const sourceId = event.target?.data?.('holonId') ?? event.target?.id?.();
    if (!sourceId) return;
    queueMicrotask(() => replaceNodeRelationshipMenuAction(document.querySelector('.holon-context-menu'), sourceId));
  };
  grabHandler = event => { closeDropMenu(); draggedNodeId = String(event.target.id()); event.target.style('z-index', 9999); };
  freeHandler = event => {
    const sourceNode = event.target;
    const sourceId = draggedNodeId || String(sourceNode.id());
    draggedNodeId = null;
    const sourceBox = sourceNode.renderedBoundingBox({ includeLabels: false, includeOverlays: false });
    let bestTarget = null, bestOverlap = 0;
    graph.nodes().forEach(node => {
      if (String(node.id()) === sourceId) return;
      const overlap = overlapArea(sourceBox, node.renderedBoundingBox({ includeLabels: false, includeOverlays: false }));
      if (overlap > bestOverlap) { bestOverlap = overlap; bestTarget = node; }
    });
    sourceNode.removeStyle('z-index');
    if (!bestTarget || bestOverlap <= 0) return;
    const original = event.originalEvent;
    const containerRect = graph.container()?.getBoundingClientRect?.();
    const rendered = sourceNode.renderedPosition();
    const point = {
      x: Number.isFinite(original?.clientX) ? original.clientX : (containerRect?.left || 0) + rendered.x,
      y: Number.isFinite(original?.clientY) ? original.clientY : (containerRect?.top || 0) + rendered.y,
    };
    showDropActionMenu(sourceId, String(bestTarget.id()), point);
  };
  graph.on('cxttap', 'edge', contextHandler);
  graph.on('cxttap', 'node', nodeContextHandler);
  graph.on('grab', 'node', grabHandler);
  graph.on('free', 'node', freeHandler);
  attachedGraph = graph;
  installDimensionSync(graph);
}

export function initRelationshipContext() {
  attach();
  window.addEventListener('eB:modelChanged', attach);
  window.addEventListener('features:loaded', attach);
}
