import { Link, useParams, Navigate } from "react-router-dom";
import { Compass, ArrowLeft } from "lucide-react";

const UPDATED = "20 September 2026";

const PAGES = {
  terms: {
    title: "Terms of Service",
    sections: [
      ["Service", "ProximityMap is a web application that lets you view maps, overlay data layers, analyse places near a point or property outline, upload your own data, and generate reports. The free tier is provided as-is. 'ProximityMap Pro' is a recurring subscription at $4.99 per month that unlocks printable PDF briefs, shareable report links and unlimited AI Analyst questions for as long as the subscription remains active."],
      ["Accounts", "You may use ProximityMap without an account. Creating an account lets a Pro purchase follow you across devices. You are responsible for keeping your password confidential and for all activity under your account. You must be at least 18 years old to purchase ProximityMap Pro."],
      ["Acceptable use", "Do not misuse the service: no scraping or bulk automated requests, no attempts to bypass paid features, no uploading of data you do not have the right to share, and no unlawful, harmful or infringing use."],
      ["Data accuracy", "Places, distances, weather, air quality, elevation and traffic are sourced from third parties (OpenStreetMap contributors, Open-Meteo, TomTom) and computed as straight-line measurements. They are provided for general information only and may be incomplete, outdated or inaccurate. Always verify critical facts independently before making financial, legal or safety decisions. AI Analyst answers are generated automatically and may contain errors."],
      ["Your content", "You keep ownership of data you upload. You grant ProximityMap a limited licence to store and display it solely to operate the service for you. You can delete uploaded layers at any time."],
      ["Third-party terms", "Map tiles and traffic data are provided by TomTom and are subject to TomTom's end-user terms. Place data is © OpenStreetMap contributors under the ODbL."],
      ["Disclaimer & liability", "The service is provided 'as is' without warranties of any kind. To the maximum extent permitted by law, ProximityMap is not liable for indirect, incidental or consequential damages, or for any decision made in reliance on the information shown. Our total liability is limited to the amount you paid for ProximityMap Pro."],
      ["Changes & termination", "We may update these terms or the service. Material changes will be posted on this page with a new date. We may suspend accounts that breach these terms."],
      ["Contact", "Questions about these terms: use the contact details shown on the operator's website or the email published on the checkout page."],
    ],
  },
  privacy: {
    title: "Privacy Policy",
    sections: [
      ["What we collect", "Account holders: email address, display name and a hashed password. Pro buyers: Stripe checkout and subscription references (Stripe processes card details; we never see your card number). Optional brief branding: company/contact details and a logo you upload. Usage data: locations you analyse, radius and layer settings needed to fulfil your requests, AI Analyst conversations (stored per session so the conversation can continue), and standard server logs."],
      ["How we use it", "To run the service, unlock Pro features, render your branded briefs, restore shared reports, provide AI answers about your current analysis, prevent abuse (e.g. login rate limiting) and fix problems."],
      ["Third parties we share with", "Stripe (payments and tax), TomTom (map tiles, traffic and address search — receives the coordinates/queries you view), Open-Meteo (weather, air quality and elevation for the coordinates you analyse), OpenStreetMap Overpass servers (place searches), and OpenAI via our AI provider (the question text and a compact summary of your current analysis). We do not sell personal data."],
      ["Cookies & storage", "We use strictly necessary cookies for sign-in (httpOnly access and refresh tokens) and browser local storage to remember a device-level Pro pass, your AI session id and free-question count. No advertising cookies."],
      ["Retention", "Account data is kept until you ask us to delete your account. Shared reports and AI conversations are retained to keep links and sessions working; you can clear an AI conversation at any time from the Analyst panel."],
      ["Your rights", "You may request access to, correction of, or deletion of your personal data, and object to processing, subject to applicable law (including GDPR/UK GDPR and CCPA where they apply). Contact us using the details on the operator's website."],
      ["Security", "Passwords are hashed with bcrypt, sessions use short-lived signed tokens, uploads are stored in access-controlled object storage and all traffic is encrypted in transit."],
      ["Children", "ProximityMap is not directed at children under 16 and we do not knowingly collect their data."],
      ["Changes", "We will post any changes to this policy here with an updated date."],
    ],
  },
  refunds: {
    title: "Refund Policy",
    sections: [
      ["ProximityMap Pro", "ProximityMap Pro is a $4.99/month subscription that unlocks features while the subscription is active. You may cancel through the Stripe billing portal; cancellation stops future renewals, while access remains available through the current paid period."],
      ["14-day guarantee", "If you have not used any Pro feature, or if Pro failed to unlock after a successful payment and we could not fix it, you may request a full refund within 14 days of purchase."],
      ["Duplicate charges", "If you were charged more than once for the same pass, we will refund the duplicate in full at any time."],
      ["How to request", "Send the email address used at checkout and the Stripe receipt number to the contact details shown on the operator's website. Approved refunds are returned to the original payment method by Stripe, typically within 5–10 business days."],
      ["Statutory rights", "Nothing in this policy limits rights you have under consumer law in your country."],
    ],
  },
};

export default function LegalPage() {
  const { page } = useParams();
  const doc = PAGES[page];
  if (!doc) return <Navigate to="/legal/terms" replace />;
  return (
    <div className="min-h-screen bg-[#0b0f17] text-slate-100" data-testid={`legal-${page}`}>
      <header className="border-b border-white/5 px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-sm text-slate-400 hover:text-sky-300" data-testid="legal-back-link">
            <ArrowLeft size={14} /> Back to ProximityMap
          </Link>
          <nav className="flex gap-4 text-xs font-mono uppercase tracking-widest">
            {Object.entries(PAGES).map(([k, v]) => (
              <Link key={k} to={`/legal/${k}`} className={k === page ? "text-sky-300" : "text-slate-500 hover:text-slate-300"} data-testid={`legal-nav-${k}`}>
                {v.title.split(" ")[0]}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <article className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500">
          <Compass size={12} /> ProximityMap
        </div>
        <h1 className="font-heading text-4xl font-bold tracking-tight" data-testid="legal-title">{doc.title}</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated {UPDATED}</p>
        <div className="mt-8 space-y-6">
          {doc.sections.map(([h, body]) => (
            <section key={h}>
              <h2 className="font-heading text-lg font-semibold text-slate-100">{h}</h2>
              <p className="mt-1.5 text-base leading-relaxed text-slate-300">{body}</p>
            </section>
          ))}
        </div>
      </article>
    </div>
  );
}
