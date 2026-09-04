// eB-Lists domain capabilities.
// These functions contain application behavior; transports (REST/MCP/UI) should call them
// rather than implementing the behavior themselves.

export const LIST_CAPABILITIES = [
  {
    name: 'lists.get',
    description: 'Get lists visible to the current user.',
  },
];

export async function getLists({ supabase }) {
  const { data, error } = await supabase
    .from('lists')
    .select('*')
    .order('created_at');

  if (error) throw error;
  return data ?? [];
}
