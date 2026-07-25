import { Link } from "wouter";
import { Logo } from "@/components/Logo";

export default function Terms() {
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
        <h1 className="text-3xl font-bold">Terms of Service</h1>
        <p className="text-slate-600">
          By using Easy Fuel you agree to use the platform lawfully for fuel ordering, delivery, and
          related account activity. Support requests submitted via the contact form must be accurate
          and respectful.
        </p>
        <p className="text-slate-600">
          Questions?{" "}
          <Link href="/contact" className="text-teal-700 underline">
            Contact support
          </Link>
          .
        </p>
        <p className="text-sm text-slate-500">Last updated: {new Date().toISOString().slice(0, 10)}</p>
      </main>
    </div>
  );
}
