export const metadata = {
  alternates: { canonical: "/privacy" },
  title: "Privacy Policy | LeaseGuard",
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
          Last updated: October 2026
        </p>

        <section className="space-y-8 text-sm text-gray-600 leading-relaxed">
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-2">
              1. Information We Collect
            </h2>
            <p>
              When you use LeaseGuard, we collect your account email address, the documents you upload (a commercial lease and CAM reconciliation statements, as PDFs or photos) so that we can perform your audit, the text we extract from those documents, the results of the analysis (which include short excerpts quoted from your documents), and payment records (the amount, the date and the audit purchased). Card details are entered on Stripe and never reach us. Our hosting provider also keeps standard server logs, such as IP address, browser type and the pages requested.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-2">
              2. How We Use Your Information
            </h2>
            <p>
              Uploaded documents are used to generate your CAM audit report. We do not sell your documents. They are kept in private storage tied to your account, and other LeaseGuard customers cannot open them in the app. To produce your audit, text extracted from your documents is sent to our AI analysis provider, and your files and results are stored and processed by the service providers listed in Section 4, only so that LeaseGuard can operate. The person who operates LeaseGuard can also technically reach stored files and records through the hosting and database tools, and may do so when needed to provide support or fix a problem.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-2">
              3. Data Retention
            </h2>
            <p>
              Uploaded documents and audit results stay in your account until they are deleted. We do not currently delete them automatically, and there is no fixed retention period. You may ask us to delete your documents and audit results at any time by contacting us at{" "}
              <a
                href="mailto:support@leaseguard.io"
                className="text-blue-700 hover:underline"
              >
                support@leaseguard.io
              </a>
              .
            
              There is no delete button in your account yet, so a deletion request is handled by us by hand. Deleting removes your documents and results from LeaseGuard&apos;s own storage and database. Copies and backups held by the providers in Section 4 follow their own retention practices, which we do not control.
              We may need to keep basic payment records (amount, date and the audit purchased) for accounting and tax purposes.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-2">
              4. Third-Party Services
            </h2>
            <p>
              LeaseGuard uses these services to operate, and each handles data under its own terms and privacy policy. Supabase stores your account, your results and your uploaded files. Anthropic&apos;s AI service receives text extracted from your documents (up to the first 20,000 characters of each document, not the files or images) and returns the key figures used in your audit. Vercel hosts the website, runs the processing and keeps server logs. Stripe processes payments and receives your email address, your payment details and identifiers that link the payment to your audit. Resend sends sign-in, password and purchase confirmation emails, which contain your email address and your purchase details but not your documents.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-2">
              5. Cookies and Analytics
            </h2>
            <p>
              LeaseGuard does not use advertising or analytics cookies. Your sign-in session is kept in your browser local storage. Stripe may set its own cookies on its payment pages. You can manage cookies and site data through your browser settings.
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
                href="mailto:support@leaseguard.io"
                className="text-blue-700 hover:underline"
              >
                support@leaseguard.io
              </a>
              .
            </p>
          </div>
        </section>
      </article>
    </main>
  );
}
