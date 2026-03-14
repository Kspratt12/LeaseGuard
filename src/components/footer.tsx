import Link from "next/link";
import Image from "next/image";

export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-gray-950 text-gray-400">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-10">
          {/* Brand */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-1 space-y-4">
            <Image
              src="/leaseguard-logo.png"
              alt="LeaseGuard CAM audit software logo"
              width={150}
              height={36}
              loading="lazy"
              className="h-10 w-auto brightness-0 invert"
            />
            <p className="text-sm leading-relaxed">
              CAM audit analysis for commercial tenants. Results depend on
              document clarity and lease structure.
            </p>
          </div>

          {/* Product */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4">
              Product
            </p>
            <ul className="space-y-2.5">
              {[
                { href: "/#features", label: "Features" },
                { href: "/#pricing", label: "Pricing" },
                { href: "/#how-it-works", label: "How It Works" },
                { href: "/upload", label: "Run Audit" },
              ].map((link) =>
                link.href.startsWith("/#") ? (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      className="text-sm hover:text-white transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ) : (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm hover:text-white transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ),
              )}
            </ul>
          </div>

          {/* Support */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4">
              Support
            </p>
            <ul className="space-y-2.5">
              {[
                { href: "/#faq", label: "FAQ" },
                { href: "/contact", label: "Contact" },
                { href: "/resources", label: "Resources" },
                { href: "/about", label: "About" },
              ].map((link) =>
                link.href.startsWith("/#") ? (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      className="text-sm hover:text-white transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ) : (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm hover:text-white transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ),
              )}
            </ul>
          </div>

          {/* Lease Audit Guides */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4">
              Lease Audit Guides
            </p>
            <ul className="space-y-2.5">
              <li>
                <Link
                  href="/commercial-cam-audit"
                  className="text-sm hover:text-white transition-colors"
                >
                  Commercial CAM Audit
                </Link>
              </li>
              <li>
                <Link
                  href="/cam-reconciliation-audit"
                  className="text-sm hover:text-white transition-colors"
                >
                  CAM Reconciliation Audit
                </Link>
              </li>
              <li>
                <Link
                  href="/triple-net-lease-audit"
                  className="text-sm hover:text-white transition-colors"
                >
                  Triple Net Lease Audit
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4">
              Legal
            </p>
            <ul className="space-y-2.5">
              <li>
                <Link
                  href="/terms"
                  className="text-sm hover:text-white transition-colors"
                >
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="text-sm hover:text-white transition-colors"
                >
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-gray-500">
            &copy; {new Date().getFullYear()} LeaseGuard. All rights reserved.
          </p>
          <p className="text-xs text-gray-600">
            AI-powered analysis for informational purposes only. Not legal or
            accounting advice.
          </p>
        </div>
      </div>
    </footer>
  );
}
