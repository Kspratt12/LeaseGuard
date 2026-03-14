import type { Metadata } from "next";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://leaseguard.ai"),
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

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "LeaseGuard",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "AI-powered CAM audit analysis for commercial tenants reviewing lease clauses and reconciliation statements.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: "Free audit preview. Full evidence report available for $49.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-screen antialiased flex flex-col">
        <Navbar />
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
