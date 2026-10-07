import { appleAppSiteAssociation } from '@/lib/vertexAppLinks';

// Read on every request: the app's ids come from the server's environment.
export const dynamic = 'force-dynamic';

/** Lets iOS open the website's links in the Vertex app (lib/vertexAppLinks.ts). */
export function GET() {
  const body = appleAppSiteAssociation();
  if (!body) return new Response('Not found', { status: 404 });
  return Response.json(body, { headers: { 'cache-control': 'public, max-age=3600' } });
}
