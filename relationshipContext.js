// Relationship graph context actions.
// Extends the graph's relationship context menu and owns relationship-specific drag/drop behavior.

import { eBliss } from './eBSDK.js';
import { getHolonGraph } from './holonGraph.js';
import { eBStatus } from './eBStatus.js';
import { showModal } from './eBModal.js';

let attachedGraph = null;
let contextHandler = null;
let grabHandler = null;
let freeHandler = null;
let draggedNodeId = null;

async function reverseRelationship(relationship) {
  if (!relationship?.id) return;

  const source = relationship.source_holon_id;
  const target = relationship.target_holon_id;
  if (!source || !target) {
    eBStatus.warn('Relationship source and target are required');
    return;
  }

  eBStatus.info('Reversing relationship…');
  try {
    await eBliss.relationships.update(relationship.id, {
      source_holon_id: target,
      target_holon_id: source,
    });
    eBStatus.success('Relationship reversed');
  } catch (error) {
    eBStatus.error(error?.message || 'Unable to reverse relationship');
  }
}

async function createDroppedRelationship(sourceId, targetId) {
  if (!sourceId || !targetId || String(sourceId) === String(targetId)) return;

  let model;
  try {
    model = await eBliss.model.load();
  } catch (error) {
    eBStatus.error(error?.message || 'Unable to load relationship types');
    return;
  }

  const holons = model?.holons || [];
  const relationshipTypes = model?.relationshipTypes || [];
  const source = holons.find(item => String(item.id) === String(sourceId));
  const target = holons.find(item => String(item.id) === String(targetId));
  if (!source || !target) return;
  if (!relationshipTypes.length) {
    eBStatus.warn('No relationship types are available');
    return;
  }

  const values = await showModal({
    title: `Relate ${source.name || '(unnamed)'} → ${target.name || '(unnamed)'}`,
    submitLabel: 'Create Relationship',
    fields: [
      {
        name: 'relationship_type_id',
        label: 'Relationship',
        type: 'select',
        options: relationshipTypes
          .map(type => ({ value: type.id, label: type.name || '(unnamed)' }))
          .sort((a, b) => String(a.label).localeCompare(String(b.label))),
        required: true,
      },
      { name: 'position', label: 'Position', type: 'number', value: '0' },
    ],
  });

  if (!values?.relationship_type_id) return;

  eBStatus.info(`Creating ${source.name || 'Holon'} → ${target.name || 'Holon'} relationship…`);
  try {
    await eBliss.relationships.create({
      source_holon_id: source.id,
      relationship_type_id: values.relationship_type_id,
      target_holon_id: target.id,
      position: Number(values.position) || 0,
    });
    eBStatus.success('Relationship created');
    window.dispatchEvent(new CustomEvent('eB:modelChanged'));
  } catch (error) {
    eBStatus.error(error?.message || 'Unable to create relationship');
  }
}

function overlapArea(a, b) {
  const width = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const height = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  return width * height;
}

function addReverseMenuItem(menu, relationship) {
  if (!menu || menu.querySelector('[data-eb-action="reverse-relationship"]')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Reverse';
  button.dataset.ebAction = 'reverse-relationship';
  button.setAttribute('role', 'menuitem');
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    menu.remove();
    void reverseRelationship(relationship);
  });

  const deleteButton = [...menu.querySelectorAll('button')]
    .find(item => item.textContent?.trim() === 'Delete Relationship');
  if (deleteButton) menu.insertBefore(button, deleteButton);
  else menu.appendChild(button);
}

function attach() {
  const graph = getHolonGraph();
  if (!graph || graph === attachedGraph) return;

  if (attachedGraph) {
    if (contextHandler) attachedGraph.off('cxttap', 'edge', contextHandler);
    if (grabHandler) attachedGraph.off('grab', 'node', grabHandler);
    if (freeHandler) attachedGraph.off('free', 'node', freeHandler);
  }

  contextHandler = event => {
    const relationship = event.target?.data?.('relationship');
    if (!relationship) return;

    // holonGraph creates its base menu first; extend that same menu.
    queueMicrotask(() => addReverseMenuItem(document.querySelector('.holon-context-menu'), relationship));
  };

  grabHandler = event => {
    draggedNodeId = String(event.target.id());
    event.target.style('z-index', 9999);
  };

  freeHandler = event => {
    const sourceNode = event.target;
    const sourceId = draggedNodeId || String(sourceNode.id());
    draggedNodeId = null;

    const sourceBox = sourceNode.renderedBoundingBox({ includeLabels: false, includeOverlays: false });
    let bestTarget = null;
    let bestOverlap = 0;

    graph.nodes().forEach(node => {
      if (String(node.id()) === sourceId) return;
      const overlap = overlapArea(
        sourceBox,
        node.renderedBoundingBox({ includeLabels: false, includeOverlays: false }),
      );
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestTarget = node;
      }
    });

    sourceNode.removeStyle('z-index');
    if (!bestTarget || bestOverlap <= 0) return;
    void createDroppedRelationship(sourceId, String(bestTarget.id()));
  };

  graph.on('cxttap', 'edge', contextHandler);
  graph.on('grab', 'node', grabHandler);
  graph.on('free', 'node', freeHandler);
  attachedGraph = graph;
}

export function initRelationshipContext() {
  attach();
  window.addEventListener('eB:modelChanged', attach);
  window.addEventListener('features:loaded', attach);
}
