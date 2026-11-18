import sitemap from "@/lib/public-sitemap";

const xmlEntities: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
};

export async function GET() {
  const entries = await sitemap();
  const urls = entries.map(({ url, changeFrequency, priority }) => {
    const location = url.replace(/[&<>"']/g, (character) => xmlEntities[character]);
    return `<url>\n<loc>${location}</loc>\n<changefreq>${changeFrequency}</changefreq>\n<priority>${priority}</priority>\n</url>`;
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // Mark the end of the XML independently of Next's wait for revalidation.
      // A transform would remove that byte boundary and reintroduce the wait.
      "Content-Length": String(Buffer.byteLength(xml, "utf8")),
      "Cache-Control": "public, max-age=0, must-revalidate, no-transform",
      // The HTTP/1 origin may still be finishing revalidation after the last byte.
      // A proxy must open another upstream connection for its next request.
      "Connection": "close",
    },
  });
}
