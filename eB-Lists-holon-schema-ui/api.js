import { getLists, LIST_CAPABILITIES } from './capabilities/lists.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// Transport adapter: REST delegates to the domain capability.
export async function handleApi(request, supabase) {
  const url = new URL(request.url);

  if (url.pathname === '/api/capabilities') {
    return json({ capabilities: LIST_CAPABILITIES });
  }

  if (url.pathname === '/api/lists' && request.method === 'GET') {
    try {
      return json({ lists: await getLists({ supabase }) });
    } catch (error) {
      return json({ error: error.message || 'Unable to load lists' }, 500);
    }
  }

  return json({ error: 'Not found' }, 404);
}
