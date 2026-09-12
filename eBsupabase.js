// eBliss Supabase backend adapter.
// The rest of the application talks to this backend contract instead of
// calling Supabase directly.

const SUPABASE_URL = 'https://zaabghrczrbqkxrhkinj.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_QL6Bz9m30CV8HFIdkLQ42Q_N9AFIOkF';
const DYNAMIC_FIELDS_KEY = '_eBFields';

export function createEBSupabase()
{
  if (!window.supabase) throw new Error('Supabase client library is not loaded');
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const result = (label, response) => { if (response.error) throw new Error(`${label}: ${response.error.message}`); return response.data; };

  async function resolveHolonValues(values)
  {
    const normalized = { ...values };
    const contentKey = Object.keys(normalized).find(key => key.toLowerCase() === 'content');
    if (contentKey && contentKey !== 'Content') { normalized.Content = normalized[contentKey]; delete normalized[contentKey]; }
    if (normalized.holon_type !== undefined)
    {
      const typeName = String(normalized.holon_type).trim();
      delete normalized.holon_type;
      const type = result('Holon type', await supabase.from('holon_types').select('id').eq('name', typeName).single());
      normalized.holon_type_id = type.id;
    }
    return normalized;
  }

  async function currentUserId() { const sessionResult = await supabase.auth.getSession(); return sessionResult.data.session?.user?.id || null; }
  async function currentAuthUser()
  {
    const response = await supabase.auth.getUser();
    if (response.error) throw new Error(`Authentication: ${response.error.message}`);
    if (!response.data.user) throw new Error('A signed-in user is required');
    return response.data.user;
  }
  async function requireReviewAuthority()
  {
    const user = await currentAuthUser();
    if (user.app_metadata?.eb_authority !== 'founder') throw new Error('Founder authority is required to review changes');
  }
  async function requireRejectAuthority(provenanceId)
  {
    const user = await currentAuthUser();
    if (user.app_metadata?.eb_authority === 'founder') return;
    const change = await readProvenance(provenanceId);
    if (String(change.provenance?.actor || '') !== String(user.id)) throw new Error('Only the proposal creator or a founder can reject this change');
  }
  async function upsertProfile(userId, values)
  {
    const profile = result('Profile', await supabase.from('profiles').upsert({ id: userId, ...values }).select().single());
    result('Participant directory', await supabase.from('participant_directory').upsert({ id: userId, display_name: profile.display_name, person_holon_id: profile.person_holon_id, updated_at: profile.updated_at }).select('id').single());
    return profile;
  }
  async function rawCreateHolon(values) { return result('Holon', await supabase.from('holons').insert(await resolveHolonValues(values)).select().single()); }
  async function rawUpdateHolon(holonId, values) { return result('Holon', await supabase.from('holons').update(await resolveHolonValues(values)).eq('id', holonId).select().single()); }
  async function rawDeleteHolon(holonId) { result('Relationships', await supabase.from('relationships').delete().or(`source_holon_id.eq.${holonId},target_holon_id.eq.${holonId}`)); return result('Holon', await supabase.from('holons').delete().eq('id', holonId).select('id').single()); }
  async function rawCreateRelationship(values) { return result('Relationship', await supabase.from('relationships').insert(values).select().single()); }
  async function rawUpdateRelationship(id, values) { return result('Relationship', await supabase.from('relationships').update(values).eq('id', id).select().single()); }
  async function rawDeleteRelationship(id) { return result('Relationship', await supabase.from('relationships').delete().eq('id', id).select('id').single()); }

  function emitChange(eventName, detail = {}) { try { window.dispatchEvent(new CustomEvent(eventName, { detail })); } catch { } }

  async function provenanceTypeId() { const row = result('Provenance type', await supabase.from('holon_types').select('id').eq('name', 'Provenance').single()); return row.id; }

  async function provenanceFields()
  {
    const provenanceHolonTypeId = await provenanceTypeId();
    const provenanceHolon = result('Provenance Holon', await supabase.from('holons').select('id').eq('name', 'Provenance').eq('holon_type_id', (await supabase.from('holon_types').select('id').eq('name', 'Holon').single()).data?.id).maybeSingle());
    if (!provenanceHolon) return {};
    const fieldType = result('Holon Field type', await supabase.from('holon_types').select('id').eq('name', 'Holon Field').single());
    const fieldOf = result('field of relationship type', await supabase.from('relationship_types').select('id').eq('name', 'field of').single());
    const links = result('Provenance fields', await supabase.from('relationships').select('source_holon_id').eq('relationship_type_id', fieldOf.id).eq('target_holon_id', provenanceHolon.id));
    const ids = (links || []).map(row => row.source_holon_id);
    const fields = ids.length ? result('Provenance field definitions', await supabase.from('holons').select('id,name').eq('holon_type_id', fieldType.id).in('id', ids)) : [];
    return Object.fromEntries((fields || []).map(field => [String(field.name).trim().toLowerCase(), field.id]));
  }

  async function createProvenance(action, changes, targetHolonId = null, source = 'eB-Holarchy SDK')
  {
    const fields = await provenanceFields();
    const now = new Date().toISOString();
    const actor = await currentUserId();
    const values = {};
    const set = (name, value) => { if (fields[name]) values[String(fields[name])] = value; };
    set('timestamp', now); set('action', action); set('status', 'pending'); set('actor', actor || 'anonymous'); set('source', source); set('changes', changes);
    const provenance = await rawCreateHolon({ holon_type: 'Provenance', name: `${action} — pending`, Content: JSON.stringify({ [DYNAMIC_FIELDS_KEY]: values }) });
    if (targetHolonId)
    {
      const ofType = result('of relationship type', await supabase.from('relationship_types').select('id').eq('name', 'of').single());
      await rawCreateRelationship({ source_holon_id: provenance.id, relationship_type_id: ofType.id, target_holon_id: targetHolonId });
    }
    emitChange('eB:provenanceCreated', { provenanceId: provenance.id });
    return provenance;
  }

  async function readProvenance(provenanceId)
  {
    const provenance = result('Provenance', await supabase.from('holons_view').select('*').eq('id', provenanceId).single());
    const fields = await provenanceFields();
    let parsed = {}; try { parsed = JSON.parse(String(provenance.Content || '{}')); } catch { }
    const dynamic = parsed?.[DYNAMIC_FIELDS_KEY] || {};
    const byName = {};
    for (const [name, id] of Object.entries(fields)) byName[name] = dynamic[String(id)];
    return { ...provenance, provenance: byName };
  }

  async function setProvenanceStatus(provenanceId, status, extra = {})
  {
    const current = await readProvenance(provenanceId);
    const fields = await provenanceFields();
    let parsed = {}; try { parsed = JSON.parse(String(current.Content || '{}')); } catch { }
    const dynamic = { ...(parsed[DYNAMIC_FIELDS_KEY] || {}) };
    if (fields.status) dynamic[String(fields.status)] = status;
    const actor = await currentUserId();
    if (fields.actor && actor) dynamic[String(fields.actor)] = actor;
    if (fields.reason && extra.reason) dynamic[String(fields.reason)] = extra.reason;
    return rawUpdateHolon(provenanceId, { name: `${current.provenance.action || 'change'} — ${status}`, Content: JSON.stringify({ ...parsed, [DYNAMIC_FIELDS_KEY]: dynamic }) });
  }

  async function repointPendingRelationshipCreates(fromHolonId, toHolonId)
  {
    if (!fromHolonId || !toHolonId || String(fromHolonId) === String(toHolonId)) return;
    const typeId = await provenanceTypeId();
    const fields = await provenanceFields();
    if (!fields.status || !fields.changes) return;
    const rows = result('Pending relationship changes', await supabase.from('holons').select('id,Content').eq('holon_type_id', typeId));
    for (const row of rows || [])
    {
      let parsed = {};
      try { parsed = JSON.parse(String(row.Content || '{}')); } catch { continue; }
      const dynamic = { ...(parsed[DYNAMIC_FIELDS_KEY] || {}) };
      if (String(dynamic[String(fields.status)] || '').toLowerCase() !== 'pending') continue;
      let change = dynamic[String(fields.changes)];
      if (typeof change === 'string') { try { change = JSON.parse(change); } catch { continue; } }
      if (!change || change.entity !== 'relationship' || change.operation !== 'create') continue;
      if (String(change.values?.source_holon_id || '') !== String(fromHolonId)) continue;
      const nextChange = { ...change, values: { ...change.values, source_holon_id: toHolonId } };
      dynamic[String(fields.changes)] = JSON.stringify(nextChange);
      await rawUpdateHolon(row.id, { Content: JSON.stringify({ ...parsed, [DYNAMIC_FIELDS_KEY]: dynamic }) });
    }
  }

  async function applyChange(provenanceId, decision, reason = '')
  {
    const item = await readProvenance(provenanceId);
    if (item.provenance.status !== 'pending') throw new Error(`Change is already ${item.provenance.status}`);
    if (decision === 'reject') { const rejected = await setProvenanceStatus(provenanceId, 'rejected', { reason }); emitChange('eB:modelChanged', { provenanceId, status: 'rejected' }); return rejected; }
    if (decision !== 'approve') throw new Error('Decision must be approve or reject');
    const change = typeof item.provenance.changes === 'string' ? JSON.parse(item.provenance.changes) : item.provenance.changes;
    let targetId = change?.targetId || null;
    if (change.entity === 'holon')
    {
      if (change.operation === 'create')
      {
        const creatorId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(item.provenance.actor || '')) ? item.provenance.actor : null;
        const created = await rawCreateHolon({ ...change.values, ...(creatorId ? { created_by: creatorId } : {}) });
        targetId = created.id;
        await repointPendingRelationshipCreates(provenanceId, targetId);
      }
      else if (change.operation === 'update') await rawUpdateHolon(targetId, change.values);
      else if (change.operation === 'delete') { await rawDeleteHolon(targetId); targetId = null; }
    }
    else if (change.entity === 'relationship')
    {
      if (change.operation === 'create')
      {
        const existing = result('Relationship lookup', await supabase.from('relationships').select('id').eq('source_holon_id', change.values.source_holon_id).eq('relationship_type_id', change.values.relationship_type_id).eq('target_holon_id', change.values.target_holon_id).maybeSingle());
        if (existing) targetId = existing.id;
        else targetId = (await rawCreateRelationship(change.values)).id;
      }
      else if (change.operation === 'update') await rawUpdateRelationship(targetId, change.values);
      else if (change.operation === 'delete') { await rawDeleteRelationship(targetId); targetId = null; }
    }
    else if (change.entity === 'bundle' && change.operation === 'import') targetId = await applyHolonBundle(change.bundle);
    else throw new Error(`Unsupported change entity: ${change?.entity || 'unknown'}`);
    const approved = await setProvenanceStatus(provenanceId, 'approved', { reason });
    if (targetId && (change.entity === 'holon' || change.entity === 'bundle'))
    {
      const ofType = result('of relationship type', await supabase.from('relationship_types').select('id').eq('name', 'of').single());
      const exists = result('Provenance link', await supabase.from('relationships').select('id').eq('source_holon_id', provenanceId).eq('relationship_type_id', ofType.id).eq('target_holon_id', targetId).maybeSingle());
      if (!exists) await rawCreateRelationship({ source_holon_id: provenanceId, relationship_type_id: ofType.id, target_holon_id: targetId });
    }
    emitChange('eB:modelChanged', { provenanceId, status: 'approved', targetId });
    return { ...approved, appliedTargetId: targetId };
  }

  function prepareHolonBundle(bundle)
  {
    if (bundle?.format !== 'eBliss Holon Bundle' || !bundle?.root) throw new Error('Invalid eBliss Holon Bundle');
    const copy = JSON.parse(JSON.stringify(bundle));
    const keys = new Set();
    let count = 0;
    const visit = node =>
    {
      if (!node?.key || !node?.name || !node?.type || !Array.isArray(node.children)) throw new Error('Bundle contains an invalid Holon');
      if (keys.has(node.key)) throw new Error(`Duplicate bundle key: ${node.key}`);
      keys.add(node.key);
      node.id ||= crypto.randomUUID();
      if (++count > 2000) throw new Error('Bundle exceeds the 2,000 Holon import limit');
      node.children.forEach(child => { child.relationshipId ||= crypto.randomUUID(); visit(child); });
    };
    visit(copy.root);
    return copy;
  }

  async function findOrCreateHolonType(name)
  {
    const existing = result('Holon type lookup', await supabase.from('holon_types').select('id').eq('name', name).maybeSingle());
    return existing || result('Holon type', await supabase.from('holon_types').insert({ name, description: `Imported document ${name}` }).select('id').single());
  }

  async function findOrCreateRelationshipType(name)
  {
    const existing = result('Relationship type lookup', await supabase.from('relationship_types').select('id').eq('name', name).maybeSingle());
    return existing || result('Relationship type', await supabase.from('relationship_types').insert({ name, inverse_name: 'contains', description: 'A document Holon is part of a parent document Holon.' }).select('id').single());
  }

  async function applyHolonBundle(bundle)
  {
    const nodes = [], edges = [];
    const walk = (node, parent = null) =>
    {
      nodes.push(node);
      if (parent) edges.push({ child: node, parent });
      node.children.forEach(child => walk(child, node));
    };
    walk(bundle.root);
    const typeNames = [...new Set(nodes.map(node => node.type))];
    const typeRows = await Promise.all(typeNames.map(findOrCreateHolonType));
    const typeIds = Object.fromEntries(typeNames.map((name, index) => [name, typeRows[index].id]));
    const partOf = await findOrCreateRelationshipType('part of');
    const holonRows = nodes.map(node => ({
      id: node.id,
      holon_type_id: typeIds[node.type],
      name: node.name,
      Content: JSON.stringify({ _legacyContent: node.content || '', _eBImport: { sourceKey: node.key, ...(node === bundle.root ? { source: bundle.source } : {}) } }),
    }));
    result('Imported Holons', await supabase.from('holons').upsert(holonRows, { onConflict: 'id' }));
    if (edges.length) result('Imported relationships', await supabase.from('relationships').upsert(edges.map(({ child, parent }) => ({
      id: child.relationshipId,
      source_holon_id: child.id,
      relationship_type_id: partOf.id,
      target_holon_id: parent.id,
      position: Number(child.position || 0),
    })), { onConflict: 'id' }));
    return bundle.root.id;
  }

  async function stageHolonBundle(bundle)
  {
    const prepared = prepareHolonBundle(bundle);
    const source = `${prepared.source?.title || 'External source'} ${prepared.source?.version || ''}`.trim();
    return createProvenance('import', JSON.stringify({ entity: 'bundle', operation: 'import', bundle: prepared }), null, source);
  }

  async function createFieldDefinition(typeName, values = {})
  {
    const name = String(values.name ?? '').trim();
    if (!name) throw new Error('Field name is required');
    const type = result('Holon type', await supabase.from('holons_view').select('id').eq('name', typeName).eq('holon_type', 'Holon Type').single());
    const fieldType = result('Holon Field type', await supabase.from('holon_types').select('id').eq('name', 'Holon Field').single());
    const fieldOf = result('field of relationship type', await supabase.from('relationship_types').select('id').eq('name', 'field of').single());
    const existingLink = result('Field lookup', await supabase.from('relationships').select('source_holon_id').eq('relationship_type_id', fieldOf.id).eq('target_holon_id', type.id));
    const existingIds = (existingLink || []).map(row => row.source_holon_id);
    if (existingIds.length)
    {
      const existing = result('Field definition lookup', await supabase.from('holons').select('id,name').eq('holon_type_id', fieldType.id).in('id', existingIds));
      if ((existing || []).some(field => String(field.name).trim().toLowerCase() === name.toLowerCase())) throw new Error(`Field "${name}" already exists on ${typeName}`);
    }
    const meta = { dataType: String(values.dataType || 'text').toLowerCase(), required: values.required === true, defaultValue: values.defaultValue ?? '', order: Number(values.order ?? 0) };
    const field = await rawCreateHolon({ holon_type: 'Holon Field', name, Content: JSON.stringify(meta) });
    const relationship = await rawCreateRelationship({ source_holon_id: field.id, relationship_type_id: fieldOf.id, target_holon_id: type.id });
    emitChange('eB:modelChanged', { fieldId: field.id, holonTypeId: type.id, relationshipId: relationship.id });
    return field;
  }

  return {
    auth: { getSession() { return supabase.auth.getSession(); }, onAuthStateChange(callback) { return supabase.auth.onAuthStateChange(callback); }, signIn(email, password) { return supabase.auth.signInWithPassword({ email, password }); }, signUp(email, password) { return supabase.auth.signUp({ email, password }); }, signOut() { return supabase.auth.signOut({ scope: 'local' }); } },
    profile: { async get(userId) { return result('Profile', await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()); }, upsert: upsertProfile },
    toggles: { async list() { const userId = await currentUserId(); if (!userId) return []; return result('Feature toggles', await supabase.from('user_feature_toggles').select('feature_name, enabled, updated_at').eq('user_id', userId).order('feature_name')) || []; }, async set(name, enabled) { const userId = await currentUserId(); if (!userId) throw new Error('A signed-in user is required to change feature toggles'); return result('Feature toggle', await supabase.from('user_feature_toggles').upsert({ user_id: userId, feature_name: String(name), enabled: enabled === true }, { onConflict: 'user_id,feature_name' }).select().single()); }, async reset(name) { const userId = await currentUserId(); if (!userId) throw new Error('A signed-in user is required to reset a feature toggle'); return result('Feature toggle', await supabase.from('user_feature_toggles').delete().eq('user_id', userId).select('feature_name').maybeSingle()); } },
    model: { async load() { const [holons, relationships, relationshipTypes, holonTypes] = await Promise.all([supabase.from('holons_view').select('*').order('created_at'), supabase.from('relationships_view').select('*').order('position').order('created_at'), supabase.from('relationship_types').select('*').order('name'), supabase.from('holon_types').select('*').order('name')]); return { holons: result('Holons', holons) || [], relationships: result('Relationships', relationships) || [], relationshipTypes: result('Relationship types', relationshipTypes) || [], holonTypes: result('Holon types', holonTypes) || [] }; } },
    holons: { async create(values) { return createProvenance('create', JSON.stringify({ entity: 'holon', operation: 'create', values })); }, async get(holonId) { return result('Holon', await supabase.from('holons_view').select('*').eq('id', holonId).single()); }, async update(holonId, values) { return createProvenance('update', JSON.stringify({ entity: 'holon', operation: 'update', targetId: holonId, values }), holonId); }, async delete(holonId) { return createProvenance('delete', JSON.stringify({ entity: 'holon', operation: 'delete', targetId: holonId }), holonId); } },
    holonTypes: { async create(values) { const name = String(values?.name ?? '').trim(); if (!name) throw new Error('Holon type name is required'); const description = String(values?.description ?? '').trim(); return result('Holon type', await supabase.from('holon_types').insert({ name, description }).select().single()); } },
    relationshipTypes: { async create(values) { const name = String(values?.name ?? '').trim(); if (!name) throw new Error('Relationship type name is required'); const description = String(values?.description ?? '').trim(); return result('Relationship type', await supabase.from('relationship_types').insert({ name, description }).select().single()); } },
    relationships: { async create(values) { return createProvenance('create', JSON.stringify({ entity: 'relationship', operation: 'create', values })); }, async get(relationshipId) { return result('Relationship', await supabase.from('relationships_view').select('*').eq('id', relationshipId).single()); }, async update(relationshipId, values) { return createProvenance('update', JSON.stringify({ entity: 'relationship', operation: 'update', targetId: relationshipId, values }), null); }, async delete(relationshipId) { return createProvenance('delete', JSON.stringify({ entity: 'relationship', operation: 'delete', targetId: relationshipId })); }, },
    imports: { stage: stageHolonBundle },
    fieldDefinitions: { create(typeName, values) { return createFieldDefinition(typeName, values); } },
    changes: { async list(status = 'pending') { const typeId = await provenanceTypeId(); const rows = result('Changes', await supabase.from('holons_view').select('*').eq('holon_type_id', typeId).order('created_at', { ascending: false })); const fields = await provenanceFields(); return (rows || []).map(row => { let parsed = {}; try { parsed = JSON.parse(String(row.Content || '{}')); } catch { } const dynamic = parsed[DYNAMIC_FIELDS_KEY] || {}; const item = { ...row, provenance: Object.fromEntries(Object.entries(fields).map(([name, id]) => [name, dynamic[String(id)]])) }; return item; }).filter(item => !status || item.provenance.status === status); }, async get(id) { return readProvenance(id); }, async approve(id, reason = '') { await requireReviewAuthority(); return applyChange(id, 'approve', reason); }, async reject(id, reason = '') { await requireRejectAuthority(id); return applyChange(id, 'reject', reason); } }
  };
}
