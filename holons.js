export async function loadHolons(api)
{
  debugger;
  return api.model.load();
}

export function childrenOf(holonId, holons, relationships, relationshipTypeId = null)
{
  return relationships
    .filter(relationship =>
      relationship.target_holon_id === holonId &&
      (!relationshipTypeId || relationship.relationship_type_id === relationshipTypeId)
    )
    .sort((a, b) => (a.position ?? 999999) - (b.position ?? 999999))
    .map(relationship => holons.find(holon => holon.id === relationship.source_holon_id))
    .filter(Boolean);
}

export function buildTreeData(holons, relationships, rootId = null, relationshipTypeId = null)
{
  const roots = rootId
    ? holons.filter(holon => holon.id === rootId)
    : holons.filter(holon =>
        !relationships.some(relationship =>
          relationship.source_holon_id === holon.id &&
          (!relationshipTypeId || relationship.relationship_type_id === relationshipTypeId)
        )
      );

  return roots.map(root => addChildren(root, holons, relationships, relationshipTypeId, new Set()));
}

function addChildren(holon, holons, relationships, relationshipTypeId, path)
{
  if (path.has(holon.id))
  {
    return { ...holon };
  }

  const nextPath = new Set(path);
  nextPath.add(holon.id);

  const children = childrenOf(holon.id, holons, relationships, relationshipTypeId);

  return {
    ...holon,
    children: children.map(child =>
      addChildren(child, holons, relationships, relationshipTypeId, nextPath)
    ),
  };
}
