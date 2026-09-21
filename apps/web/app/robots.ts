import type { MetadataRoute } from 'next';
import { BASE } from './site-url';

/**
 * Nothing is disallowed, because nothing here is private: every page is a
 * static document about published standards or about this tool's own measured
 * limits. The file exists to point at the sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
