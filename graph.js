export function createHolonGraph({ element, holons, relationships, onSelect, depth = 2 })
{
  let currentDepth = normalizeDepth(depth);

  const cy = cytoscape({
    container: element,
    elements: [],
    style: [
      { selector: 'node', style: { 'label': 'data(label)', 'text-valign': 'center', 'text-halign': 'center', 'background-color': '#666', 'color': '#fff', 'font-size': 12, 'width': 54, 'height': 54, 'border-width': 1, 'border-color': '#aaa' } },
      { selector: 'node.root', style: { 'background-color': '#7a5', 'width': 72, 'height': 72, 'font-weight': 'bold' } },
      { selector: 'edge', style: { 'curve-style': 'bezier', 'width': 2, 'line-color': '#888', 'target-arrow-color': '#888', 'target-arrow-shape': 'triangle', 'label': 'data(label)', 'font-size': 9, 'text-background-opacity': 1, 'text-background-color': '#fff', 'text-background-padding': 2 } },
    ],
    layout: { name: 'preset' },
  });

  cy.on('tap', 'node', event => onSelect?.(event.target.data('holon')));
  cy.on('dbltap', 'node', event => focus(event.target.id()));
  return { cy, holons, relationships, focus, setDepth, getDepth };

  function setDepth(value)
  {
    currentDepth = normalizeDepth(value);
    const selected = cy.$('node:selected').first();
    const rootId = selected.nonempty() ? selected.id() : cy.nodes('.root').first().id();
    if (rootId) focus(rootId);
  }

  function getDepth()
  {
    return currentDepth;
  }

  function focus(rootId)
  {
    const root = holons.find(h => h.id === rootId);
    if (!root) return;

    const levels = new Map([[rootId, 0]]);
    let frontier = new Set([rootId]);

    for (let level = 1; currentDepth === Infinity || level <= currentDepth; level += 1)
    {
      const nextFrontier = new Set();
      for (const parentId of frontier)
      {
        relationships
          .filter(r => r.target_holon_id === parentId)
          .forEach(r => {
            if (levels.has(r.source_holon_id)) return;
            levels.set(r.source_holon_id, level);
            nextFrontier.add(r.source_holon_id);
          });
      }
      if (!nextFrontier.size) break;
      frontier = nextFrontier;
    }

    const visible = holons.filter(h => levels.has(h.id));
    const visibleSet = new Set(visible.map(h => h.id));
    const visibleRelationships = relationships.filter(r =>
      visibleSet.has(r.source_holon_id) && visibleSet.has(r.target_holon_id)
    );
    const maxLevel = Math.max(...levels.values());

    cy.elements().remove();
    cy.add(visible.map(h => ({
      group: 'nodes',
      data: {
        id: h.id,
        label: h.name || '(unnamed)',
        holon: h,
        level: levels.get(h.id),
      },
      classes: h.id === rootId ? 'root' : '',
    })));
    cy.add(visibleRelationships.map(r => ({
      group: 'edges',
      data: {
        id: r.id,
        source: r.source_holon_id,
        target: r.target_holon_id,
        label: r.relationship_type || '',
      },
    })));

    cy.layout({
      name: 'concentric',
      concentric: node => maxLevel - node.data('level'),
      levelWidth: () => 1,
      minNodeSpacing: 80,
      padding: 50,
      animate: true,
    }).run();

    const rootNode = cy.getElementById(rootId);
    rootNode.select();
    cy.center(rootNode);
  }

  function normalizeDepth(value)
  {
    if (value === 'all' || value === Infinity) return Infinity;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 2;
  }
}
