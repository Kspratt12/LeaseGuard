import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1d4ed8",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "LeaseGuard | CAM Audit Tool for Commercial Tenants",
  description:
    "Upload your commercial lease and CAM reconciliation statements. LeaseGuard analyzes clauses and billed expenses to detect potential CAM overcharges in about 60 seconds.",
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
    title: "LeaseGuard — AI CAM Audit for Commercial Tenants",
    description:
      "Detect CAM overcharges by comparing your lease clauses with reconciliation statements. Get results in about 60 seconds.",
    type: "website",
    siteName: "LeaseGuard",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "LeaseGuard — AI CAM Audit for Commercial Tenants",
    description:
      "Detect CAM overcharges by comparing your lease clauses with reconciliation statements. Get results in about 60 seconds.",
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

const softwareAppJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "LeaseGuard",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "AI-powered CAM audit platform for commercial tenants that analyzes lease clauses and CAM reconciliation statements to identify potential overcharges.",
  offers: {
    "@type": "Offer",
    price: "49",
    priceCurrency: "USD",
    category: "Commercial lease CAM audit report",
  },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "LeaseGuard",
  url: SITE_URL,
  logo: `${SITE_URL}/leaseguard-logo.png`,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <link
          rel="preload"
          href="/leaseguard-logo.png"
          as="image"
          type="image/png"
        />
        <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.googleapis.com" crossOrigin="anonymous" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppJsonLd) }}
        />
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
