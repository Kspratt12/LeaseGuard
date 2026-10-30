import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";

/**
 * Only public, indexable pages. No #fragment URLs, no private routes (/audit, /account,
 * /login, /api) and no page whose canonical points elsewhere (none at the moment).
 * lastModified is deliberately omitted rather than claiming every page changed on every build.
 */
const pages: { path: string; priority: number; changeFrequency: "weekly" | "monthly" | "yearly" }[] = [
  { path: "", priority: 1.0, changeFrequency: "weekly" },
  { path: "/cam-audit", priority: 0.9, changeFrequency: "monthly" },
  { path: "/cam-reconciliation-audit", priority: 0.9, changeFrequency: "monthly" },
  { path: "/commercial-cam-audit", priority: 0.8, changeFrequency: "monthly" },
  { path: "/commercial-tenant-cam-audit-guide", priority: 0.8, changeFrequency: "monthly" },
  { path: "/triple-net-lease-audit", priority: 0.8, changeFrequency: "monthly" },
  { path: "/cam-calculator", priority: 0.9, changeFrequency: "monthly" },
  { path: "/sample-cam-audit-report", priority: 0.7, changeFrequency: "monthly" },
  { path: "/resources", priority: 0.7, changeFrequency: "weekly" },
  { path: "/resources/cam-charges-explained", priority: 0.7, changeFrequency: "monthly" },
  { path: "/resources/how-to-audit-cam-charges", priority: 0.7, changeFrequency: "monthly" },
  { path: "/resources/cam-reconciliation-guide", priority: 0.7, changeFrequency: "monthly" },
  { path: "/resources/how-to-calculate-cam-charges", priority: 0.8, changeFrequency: "monthly" },
  { path: "/resources/management-fees-and-cam-caps", priority: 0.7, changeFrequency: "monthly" },
  { path: "/resources/cam-reconciliation-statement-example", priority: 0.6, changeFrequency: "monthly" },
  { path: "/resources/cam-cap-commercial-lease", priority: 0.7, changeFrequency: "monthly" },
  { path: "/resources/common-cam-overcharges", priority: 0.7, changeFrequency: "monthly" },
  { path: "/resources/what-landlords-can-include-in-cam", priority: 0.6, changeFrequency: "monthly" },
  { path: "/resources/can-landlords-charge-capital-expenses", priority: 0.6, changeFrequency: "monthly" },
  { path: "/resources/dispute-cam-charges", priority: 0.7, changeFrequency: "monthly" },
  { path: "/resources/check-your-pro-rata-share", priority: 0.7, changeFrequency: "monthly" },
  { path: "/resources/commercial-lease-dispute-letter-template", priority: 0.7, changeFrequency: "monthly" },
  { path: "/resources/cam-audit-rights", priority: 0.6, changeFrequency: "monthly" },
  { path: "/resources/commercial-lease-audit-checklist", priority: 0.6, changeFrequency: "monthly" },
  { path: "/resources/commercial-lease-audit-services", priority: 0.5, changeFrequency: "monthly" },
  { path: "/resources/hidden-costs-in-nnn-leases", priority: 0.6, changeFrequency: "monthly" },
  { path: "/resources/triple-net-lease-expenses", priority: 0.6, changeFrequency: "monthly" },
  { path: "/about", priority: 0.4, changeFrequency: "yearly" },
  { path: "/contact", priority: 0.4, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return pages.map((p) => ({
    url: `${SITE_URL}${p.path}`,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
}
