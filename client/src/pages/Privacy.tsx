import { Link } from "wouter";
import { Logo } from "@/components/Logo";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-100">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <Link href="/">
            <Logo size="md" />
          </Link>
          <Link href="/contact" className="text-sm font-medium text-teal-700 hover:underline">
            Contact
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-12">
        <h1 className="text-3xl font-bold">Privacy Policy</h1>
        <p className="text-slate-600">
          EasyFuel processes account, order, delivery, and support information to operate the fuel
          marketplace. Contact submissions (name, phone, email, message) are used only to respond to
          your enquiry and may be stored with our support mailbox.
        </p>
        <p className="text-slate-600">
          For privacy questions, email{" "}
          <a className="text-teal-700 underline" href="mailto:notification@easyfuel.ai">
            notification@easyfuel.ai
          </a>{" "}
          or use our{" "}
          <Link href="/contact" className="text-teal-700 underline">
            contact form
          </Link>
          .
        </p>
        <p className="text-sm text-slate-500">Last updated: {new Date().toISOString().slice(0, 10)}</p>
      </main>
    </div>
  );
}
