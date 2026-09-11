import { createEBSupabase } from './eBsupabase.js';

export function createEBlissSDK(backend)
{
  if (!backend) throw new Error('eBliss backend is required');

  // Authority policy belongs above the backend. Provenance is always recorded,
  // but during the founder phase ordinary edits do not require a separate
  // approval step. Later RBAC/holarchy authority can decide this per action.
  const requiresApproval = () => false;

  const commit = async operation =>
  {
    const provenance = await operation();
    if (!provenance?.id || requiresApproval()) return provenance;
    await backend.changes.approve(provenance.id);
    return provenance;
  };

  const holons = Object.freeze({
    create(values) { return commit(() => backend.holons.create(values)); },
    get(holonId) { return backend.holons.get(holonId); },
    update(holonId, values) { return commit(() => backend.holons.update(holonId, values)); },
    delete(holonId) { return commit(() => backend.holons.delete(holonId)); },
  });

  const relationships = Object.freeze({
    create(values) { return commit(() => backend.relationships.create(values)); },
    get(relationshipId) { return backend.relationships.get(relationshipId); },
    update(relationshipId, values) { return commit(() => backend.relationships.update(relationshipId, values)); },
    delete(relationshipId) { return commit(() => backend.relationships.delete(relationshipId)); },
  });

  return Object.freeze({
    auth: backend.auth,
    model: backend.model,
    holons,
    holonTypes: backend.holonTypes,
    relationshipTypes: backend.relationshipTypes,
    relationships,
    fieldDefinitions: backend.fieldDefinitions,
    changes: backend.changes,
    profile: backend.profile,
    toggles: backend.toggles,
  });
}

const backend = createEBSupabase();
export const eBliss = createEBlissSDK(backend);
