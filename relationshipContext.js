// Relationship graph context actions.
// Extends the graph's relationship context menu without coupling persistence into holonGraph.

import { eBliss } from './eBSDK.js';
import { getHolonGraph } from './holonGraph.js';
import { eBStatus } from './eBStatus.js';

let attachedGraph = null;
let contextHandler = null;

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

  if (attachedGraph && contextHandler) attachedGraph.off('cxttap', 'edge', contextHandler);

  contextHandler = event => {
    const relationship = event.target?.data?.('relationship');
    if (!relationship) return;

    // holonGraph creates its base menu first; extend that same menu.
    queueMicrotask(() => addReverseMenuItem(document.querySelector('.holon-context-menu'), relationship));
  };

  graph.on('cxttap', 'edge', contextHandler);
  attachedGraph = graph;
}

export function initRelationshipContext() {
  attach();
  window.addEventListener('eB:modelChanged', attach);
  window.addEventListener('features:loaded', attach);
}
