import { useState } from "react";
import { Link } from "wouter";
import { Mail } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

export default function Contact() {
  const { toast } = useToast();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, phone, email, message }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        throw new Error(data.message || "Failed to send message");
      }
      setSent(true);
      setFirstName("");
      setLastName("");
      setPhone("");
      setEmail("");
      setMessage("");
      toast({
        title: "Message sent",
        description: "Thanks — our support team will get back to you.",
      });
    } catch (err: unknown) {
      toast({
        title: "Could not send",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-teal-50 to-white" />

      <header className="relative z-10 border-b border-slate-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center">
            <Logo size="md" />
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-slate-600 sm:flex">
            <Link href="/" className="hover:text-teal-700">
              Home
            </Link>
            <Link href="/contact" className="font-medium text-teal-700">
              Contact
            </Link>
          </nav>
          <Link
            href="/auth"
            className="inline-flex h-10 items-center justify-center rounded-md bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700"
          >
            Login/Register
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-xl px-4 pb-16 pt-12 sm:px-6 sm:pt-16">
        <div className="mb-8 text-center">
          <span className="inline-flex rounded-full bg-teal-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-teal-800">
            Need Help?
          </span>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Contact Us
          </h1>
          <p className="mt-3 text-base text-slate-600 sm:text-lg">
            Talk to our team about orders, deliveries, account help, or anything else — no login required.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          {sent ? (
            <div className="space-y-4 text-center">
              <p className="text-lg font-medium text-slate-900">Thanks for reaching out</p>
              <p className="text-slate-600">
                We received your message and will reply to your email as soon as we can.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSent(false)}
                className="border-teal-200 text-teal-800"
              >
                Send another message
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="firstName" className="text-slate-700">
                  First Name
                </Label>
                <Input
                  id="firstName"
                  placeholder="First Name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  className="border-slate-200 bg-white text-slate-900"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-slate-700">
                  Last Name
                </Label>
                <Input
                  id="lastName"
                  placeholder="Last Name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  className="border-slate-200 bg-white text-slate-900"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-slate-700">
                  Phone <span className="text-teal-700">*</span>
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="Phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  className="border-slate-200 bg-white text-slate-900"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-700">
                  Email <span className="text-teal-700">*</span>
                </Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="border-slate-200 bg-white pl-10 text-slate-900"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="message" className="text-slate-700">
                  How can we help you?
                </Label>
                <Textarea
                  id="message"
                  placeholder="Tell us what you need help with…"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  rows={5}
                  className="resize-y border-slate-200 bg-white text-slate-900"
                />
              </div>
              <Button
                type="submit"
                disabled={submitting}
                className="h-11 w-full bg-sky-200 text-sky-950 hover:bg-sky-300"
              >
                {submitting ? "Sending…" : "Submit"}
              </Button>
              <p className="text-center text-sm text-slate-500">
                <Link href="/privacy" className="hover:text-teal-700">
                  Privacy Policy
                </Link>
                <span className="mx-2 text-slate-300">|</span>
                <Link href="/terms" className="hover:text-teal-700">
                  Terms of Service
                </Link>
              </p>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
