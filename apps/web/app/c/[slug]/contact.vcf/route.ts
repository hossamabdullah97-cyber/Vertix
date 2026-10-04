import { API_URL } from '@/lib/api';

/**
 * The card's contact file, from this site rather than the API's, so the
 * service worker can keep it with the card: "Save contact" then works on a
 * phone that has since lost its connection. The API makes it; this passes it
 * on, with the query (a variant's key, a passcode, the language) untouched.
 */
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const url = new URL(req.url);
  const forwarded = req.headers.get('x-forwarded-for');
  let res: Response;
  try {
    res = await fetch(`${API_URL}/c/${encodeURIComponent(params.slug)}/vcard${url.search}`, {
      cache: 'no-store',
      headers: forwarded ? { 'x-forwarded-for': forwarded } : {},
    });
  } catch {
    return new Response('The contact could not be fetched right now.', { status: 502 });
  }
  if (!res.ok) return new Response(null, { status: res.status === 404 ? 404 : 502 });
  return new Response(res.body, {
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'text/vcard; charset=utf-8',
      'Content-Disposition': res.headers.get('content-disposition') ?? 'attachment; filename="contact.vcf"',
      'Cache-Control': 'private, no-cache',
    },
  });
}
