import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(data: unknown, status = 200)
{
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

Deno.serve(async (request: Request) =>
{
  if (request.method === 'OPTIONS')
  {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(request.url);
  const route = url.pathname.split('/').filter(Boolean).at(-1);

  if (request.method === 'GET' && (route === 'ebliss-api' || route === 'health'))
  {
    return json({
      api: 'eBliss',
      transport: 'supabase-edge-functions',
      status: 'ok',
      version: 1,
    });
  }

  if (request.method === 'GET' && route === 'capabilities')
  {
    return json({
      capabilities: [
        'health',
      ],
    });
  }

  return json({ error: 'Not found' }, 404);
});
