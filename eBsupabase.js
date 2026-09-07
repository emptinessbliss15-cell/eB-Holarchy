// eBliss Supabase backend adapter.
// The rest of the application talks to this backend contract instead of
// calling Supabase directly.

const SUPABASE_URL = 'https://zaabghrczrbqkxrhkinj.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_QL6Bz9m30CV8HFIdkLQ42Q_N9AFIOkF';

export function createEBSupabase()
{
  if (!window.supabase) throw new Error('Supabase client library is not loaded');
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const result = (label, response) => { if (response.error) throw new Error(`${label}: ${response.error.message}`); return response.data; };

  async function resolveHolonValues(values)
  {
    const normalized = { ...values };
    if (normalized.holon_type !== undefined)
    {
      const typeName = String(normalized.holon_type).trim();
      delete normalized.holon_type;
      const type = result('Holon type', await supabase.from('holon_types').select('id').eq('name', typeName).single());
      normalized.holon_type_id = type.id;
    }
    return normalized;
  }

  async function currentUserId()
  {
    const sessionResult = await supabase.auth.getSession();
    return sessionResult.data.session?.user?.id || null;
  }

  return {
    auth: {
      getSession() { return supabase.auth.getSession(); },
      onAuthStateChange(callback) { return supabase.auth.onAuthStateChange(callback); },
      signIn(email, password) { return supabase.auth.signInWithPassword({ email, password }); },
      signUp(email, password) { return supabase.auth.signUp({ email, password }); },
      signOut() { return supabase.auth.signOut({ scope: 'local' }); },
    },
    profile: {
      async get(userId)
      {
        return result('Profile', await supabase.from('profiles').select('*').eq('id', userId).maybeSingle());
      },
      async upsert(userId, values)
      {
        return result('Profile', await supabase.from('profiles').upsert({ id: userId, ...values }, { onConflict: 'id' }).select().single());
      },
    },
    toggles: {
      async list()
      {
        const userId = await currentUserId();
        if (!userId) return [];
        return result('Feature toggles', await supabase.from('user_feature_toggles').select('feature_name, enabled, updated_at').eq('user_id', userId).order('feature_name')) || [];
      },
      async set(name, enabled)
      {
        const userId = await currentUserId();
        if (!userId) throw new Error('A signed-in user is required to change feature toggles');
        return result('Feature toggle', await supabase.from('user_feature_toggles').upsert({ user_id: userId, feature_name: String(name), enabled: enabled === true }, { onConflict: 'user_id,feature_name' }).select().single());
      },
      async reset(name)
      {
        const userId = await currentUserId();
        if (!userId) throw new Error('A signed-in user is required to reset feature toggles');
        return result('Feature toggle', await supabase.from('user_feature_toggles').delete().eq('user_id', userId).eq('feature_name', String(name)).select('feature_name').maybeSingle());
      },
    },
    model: {
      async load()
      {
        const [holons, relationships, relationshipTypes, holonTypes] = await Promise.all([
          supabase.from('holons_view').select('*').order('created_at'),
          supabase.from('relationships_view').select('*').order('position').order('created_at'),
          supabase.from('relationship_types').select('*').order('name'),
          supabase.from('holon_types').select('*').order('name'),
        ]);
        return { holons: result('Holons', holons) || [], relationships: result('Relationships', relationships) || [], relationshipTypes: result('Relationship types', relationshipTypes) || [], holonTypes: result('Holon types', holonTypes) || [] };
      },
    },
    holons: {
      async create(values) { return result('Holon', await supabase.from('holons').insert(await resolveHolonValues(values)).select().single()); },
      async get(holonId) { return result('Holon', await supabase.from('holons_view').select('*').eq('id', holonId).single()); },
      async update(holonId, values) { return result('Holon', await supabase.from('holons').update(await resolveHolonValues(values)).eq('id', holonId).select().single()); },
      async delete(holonId) { result('Relationships', await supabase.from('relationships').delete().or(`source_holon_id.eq.${holonId},target_holon_id.eq.${holonId}`)); return result('Holon', await supabase.from('holons').delete().eq('id', holonId).select('id').single()); },
    },
    holonTypes: {
      async create(values)
      {
        const name = String(values?.name ?? '').trim();
        if (!name) throw new Error('Holon type name is required');
        const description = String(values?.description ?? '').trim();
        return result('Holon type', await supabase.from('holon_types').insert({ name, description }).select().single());
      },
    },
    relationships: {
      async create(values) { return result('Relationship', await supabase.from('relationships').insert(values).select().single()); },
      async get(relationshipId) { return result('Relationship', await supabase.from('relationships_view').select('*').eq('id', relationshipId).single()); },
      async update(relationshipId, values) { return result('Relationship', await supabase.from('relationships').update(values).eq('id', relationshipId).select().single()); },
      async delete(relationshipId) { return result('Relationship', await supabase.from('relationships').delete().eq('id', relationshipId).select('id').single()); },
    },
  };
}
