import { getPublicPromotedPhoto } from "@/lib/server/public-profile-promotion";

export const dynamic = "force-dynamic";

const BASE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "cross-origin",
  "Content-Security-Policy": "default-src 'none'; sandbox",
};

function emptyNotFound(): Response {
  return new Response(null, { status: 404, headers: BASE_HEADERS });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) return emptyNotFound();

  const photo = await getPublicPromotedPhoto(token);
  if (!photo) return emptyNotFound();

  return new Response(photo.body, {
    status: 200,
    headers: {
      ...BASE_HEADERS,
      "Content-Type": photo.contentType,
      "Content-Length": String(photo.body.byteLength),
      "Content-Disposition": "inline",
    },
  });
}