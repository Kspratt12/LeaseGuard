import type { Metadata, Viewport } from "next";
import { Inter, Newsreader, IBM_Plex_Mono } from "next/font/google";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { AuditDraftProvider } from "@/components/audit-draft-context";
import { SITE_URL } from "@/lib/constants";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

// Headlines: a refined serif. Dollar figures: a tabular monospace, so amounts line up like a ledger.
const serif = Newsreader({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-serif-face",
  style: ["normal", "italic"],
});
const figures = IBM_Plex_Mono({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
  variable: "--font-figures-face",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1d4ed8",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "LeaseGuard | CAM Audit Tool for Commercial Tenants",
  description:
    "Upload your commercial lease and CAM reconciliation statements. LeaseGuard analyzes clauses and billed expenses to identify potential CAM billing discrepancies.",
  keywords: [
    "CAM audit",
    "CAM reconciliation",
    "commercial lease CAM charges",
    "CAM overcharges",
    "CAM cap analysis",
    "commercial lease audit",
    "tenant CAM audit",
    "lease clause CAM analysis",
  ],
  authors: [{ name: "LeaseGuard" }],
  creator: "LeaseGuard",
  publisher: "LeaseGuard",
  icons: {
    icon: "/leaseguard-icon.png",
    apple: "/leaseguard-icon.png",
  },
  openGraph: {
    title: "LeaseGuard | CAM Audit Tool for Commercial Tenants",
    description:
      "Compare your commercial lease with your CAM reconciliation statement to find potential billing discrepancies, with the source for each item. See the findings in a free preview.",
    type: "website",
    siteName: "LeaseGuard",
    locale: "en_US",
    // The brand mark (no new artwork). Shared links previously had no image at all.
    images: [{ url: "/leaseguard-icon.png", width: 953, height: 598, alt: "LeaseGuard" }],
  },
  twitter: {
    // "summary" (small image beside the text) suits a mark-only image; "summary_large_image" had no image to show.
    card: "summary",
    title: "LeaseGuard | CAM Audit Tool for Commercial Tenants",
    description:
      "Compare your commercial lease with your CAM reconciliation statement to find potential billing discrepancies, with the source for each item. See the findings in a free preview.",
    images: ["/leaseguard-icon.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "LeaseGuard",
  url: SITE_URL,
  logo: `${SITE_URL}/leaseguard-mark.png`,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable} ${figures.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
      </head>
      <body className="min-h-screen antialiased flex flex-col font-sans">
        <AuditDraftProvider>
          <Navbar />
          <div className="flex-1">{children}</div>
          <Footer />
        </AuditDraftProvider>
      </body>
    </html>
  );
}
