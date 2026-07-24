import { getPublicCandidateShowcasePhoto } from "@/lib/server/public-candidate-showcase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BASE_HEADERS: Record<string, string> = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Robots-Tag": "noindex, noarchive",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
};

function emptyNotFound(): Response {
  return new Response(null, { status: 404, headers: BASE_HEADERS });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const photo = await getPublicCandidateShowcasePhoto(slug);
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
