export const metadata = {
  title: "Privacy Policy — LeaseGuard",
  description:
    "Privacy Policy for LeaseGuard. Learn how we handle your uploaded documents and personal data.",
};

export default function PrivacyPage() {
  return (
    <main className="flex flex-col items-center px-4 py-20 sm:py-28">
      <article className="max-w-2xl w-full">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Privacy Policy
        </h1>
        <p className="text-sm text-gray-400 mb-10">
          Last updated: March 2026
        </p>

        <section className="space-y-8 text-sm text-gray-600 leading-relaxed">
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-2">
              1. Information We Collect
            </h2>
            <p>
              When you use LeaseGuard, we collect the documents you upload
              (commercial lease and CAM reconciliation PDFs) for the purpose of
              performing your audit analysis. We may also collect basic usage
              data such as browser type, device information, and pages visited
              to improve our service.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-2">
              2. How We Use Your Information
            </h2>
            <p>
              Uploaded documents are used solely to generate your CAM audit
              report. We do not sell, share, or distribute your documents to
              third parties. Documents are temporarily stored to complete
              processing and are handled in accordance with industry-standard
              security practices.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-2">
              3. Data Retention
            </h2>
            <p>
              Uploaded documents and audit results are retained for a limited
              period to allow you to access your reports. You may request
              deletion of your data at any time by contacting us at{" "}
              <a
                href="mailto:support@leaseguard.ai"
                className="text-blue-700 hover:underline"
              >
                support@leaseguard.ai
              </a>
              .
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-2">
              4. Third-Party Services
            </h2>
            <p>
              LeaseGuard uses third-party services for document storage,
              payment processing, and AI analysis. These providers are
              contractually bound to handle your data securely and only for the
              purposes we specify.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-2">
              5. Cookies and Analytics
            </h2>
            <p>
              We may use cookies and similar technologies to improve your
              experience and understand how LeaseGuard is used. You can manage
              cookie preferences through your browser settings.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-2">
              6. Changes to This Policy
            </h2>
            <p>
              We may update this privacy policy from time to time. Continued
              use of LeaseGuard after changes constitutes acceptance of the
              updated policy.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-2">
              7. Contact
            </h2>
            <p>
              If you have questions about this privacy policy or your data,
              contact us at{" "}
              <a
                href="mailto:support@leaseguard.ai"
                className="text-blue-700 hover:underline"
              >
                support@leaseguard.ai
              </a>
              .
            </p>
          </div>
        </section>
      </article>
    </main>
  );
}
