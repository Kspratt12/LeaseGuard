import { Mail, Send } from "lucide-react";

export const metadata = {
  title: "Contact — LeaseGuard",
  description:
    "Get in touch with the LeaseGuard team for questions about CAM audits, your account, or partnership inquiries.",
};

export default function ContactPage() {
  return (
    <main className="flex flex-col items-center px-4 py-20 sm:py-28">
      <div className="max-w-lg w-full space-y-8">
        <div className="text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
            <Mail className="h-7 w-7 text-blue-700" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Get in Touch</h1>
          <p className="text-gray-500 leading-relaxed">
            Have questions about LeaseGuard, need help with an audit, or
            interested in working together? We&apos;d love to hear from you.
          </p>
        </div>

        {/* Contact form */}
        <form
          action="mailto:support@leaseguard.ai"
          method="POST"
          encType="text/plain"
          className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 space-y-5"
        >
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-semibold text-gray-900 mb-1.5"
            >
              Name
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors"
              placeholder="Your name"
            />
          </div>
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-semibold text-gray-900 mb-1.5"
            >
              Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
              required
              className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors"
              placeholder="you@company.com"
            />
          </div>
          <div>
            <label
              htmlFor="subject"
              className="block text-sm font-semibold text-gray-900 mb-1.5"
            >
              Subject
            </label>
            <select
              id="subject"
              name="subject"
              className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors"
            >
              <option>General Question</option>
              <option>Help with an Audit</option>
              <option>Partnership Inquiry</option>
              <option>Bug Report</option>
              <option>Other</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="message"
              className="block text-sm font-semibold text-gray-900 mb-1.5"
            >
              Message
            </label>
            <textarea
              id="message"
              name="message"
              rows={5}
              required
              className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors resize-y"
              placeholder="How can we help?"
            />
          </div>
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 hover:shadow-md transition-all"
          >
            <Send className="h-4 w-4" />
            Send Message
          </button>
        </form>

        {/* Direct email fallback */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center space-y-2">
          <p className="text-sm font-semibold text-gray-900">
            Prefer email?
          </p>
          <a
            href="mailto:support@leaseguard.ai"
            className="text-sm text-blue-700 hover:underline"
          >
            support@leaseguard.ai
          </a>
          <p className="text-xs text-gray-400">
            We typically respond within 1&ndash;2 business days.
          </p>
        </div>

        <p className="text-xs text-gray-400 text-center">
          AI-powered analysis for informational purposes only. Not legal or
          accounting advice.
        </p>
      </div>
    </main>
  );
}
