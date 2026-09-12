import { createEBSupabase } from './eBsupabase.js';

export function createEBlissSDK(backend)
{
  if (!backend) throw new Error('eBliss backend is required');

  // Authority policy belongs above the backend. Provenance is always recorded,
  // but during the founder phase ordinary edits do not require a separate
  // approval step. Later RBAC/holarchy authority can decide this per action.
  const requiresApproval = async () =>
  {
    const session = await backend.auth.getSession();
    return session?.data?.session?.user?.app_metadata?.eb_authority !== 'founder';
  };

  const commit = async (operation, resolveApplied = null) =>
  {
    const provenance = await operation();
    if (!provenance?.id) return provenance;
    if (await requiresApproval()) return { ...provenance, pendingApproval: true };
    const approved = await backend.changes.approve(provenance.id);
    return resolveApplied ? resolveApplied(approved) : approved;
  };

  const holons = Object.freeze({
    create(values) { return commit(() => backend.holons.create(values), approved => backend.holons.get(approved.appliedTargetId)); },
    get(holonId) { return backend.holons.get(holonId); },
    update(holonId, values) { return commit(() => backend.holons.update(holonId, values), () => backend.holons.get(holonId)); },
    delete(holonId) { return commit(() => backend.holons.delete(holonId)); },
  });

  const relationships = Object.freeze({
    create(values) { return commit(() => backend.relationships.create(values), approved => backend.relationships.get(approved.appliedTargetId)); },
    get(relationshipId) { return backend.relationships.get(relationshipId); },
    update(relationshipId, values) { return commit(() => backend.relationships.update(relationshipId, values), () => backend.relationships.get(relationshipId)); },
    delete(relationshipId) { return commit(() => backend.relationships.delete(relationshipId)); },
  });

  const imports = Object.freeze({
    stage(bundle) { return backend.imports.stage(bundle); },
  });

  return Object.freeze({
    auth: backend.auth,
    model: backend.model,
    holons,
    holonTypes: backend.holonTypes,
    relationshipTypes: backend.relationshipTypes,
    relationships,
    imports,
    fieldDefinitions: backend.fieldDefinitions,
    changes: backend.changes,
    profile: backend.profile,
    toggles: backend.toggles,
  });
}

const backend = createEBSupabase();
export const eBliss = createEBlissSDK(backend);
