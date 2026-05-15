import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { ArrowRight, Brain, Gavel, Sparkles } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 flex items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="size-7 rounded-md bg-primary/15 border border-primary/30 grid place-items-center">
            <span className="text-primary text-sm font-semibold">F</span>
          </div>
          <span className="font-semibold tracking-tight">Fincil</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/sign-in" className={buttonVariants({ variant: "ghost" })}>
            Sign in
          </Link>
          <Link href="/sign-up" className={buttonVariants()}>
            Get started
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="px-6 py-24 md:py-32 max-w-5xl mx-auto text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-6">
            Your AI Financial Council
          </p>
          <h1 className="text-4xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
            What if your money came with{" "}
            <span className="text-primary">a debate team?</span>
          </h1>
          <p className="text-base md:text-lg text-muted-foreground mt-6 max-w-2xl mx-auto">
            Three AI personas debate every purchase before you spend. Grounded in
            your real transaction history. Built for people who think before they
            buy.
          </p>
          <div className="flex items-center justify-center gap-3 mt-10">
            <Link href="/sign-up" className={buttonVariants({ size: "lg" })}>
              Start free
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/sign-in"
              className={buttonVariants({ size: "lg", variant: "ghost" })}
            >
              I have an account
            </Link>
          </div>
        </section>

        {/* Personas */}
        <section className="px-6 pb-24 max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                name: "The Miser",
                tag: "Risk-averse",
                color: "text-miser",
                desc: "Protects your runway. Cites every rupee you spent last month.",
              },
              {
                name: "The Visionary",
                tag: "Growth-focused",
                color: "text-visionary",
                desc: "Argues for ROI, productivity, and the long arc of compounding.",
              },
              {
                name: "The Twin",
                tag: "The judge",
                color: "text-twin",
                desc: "Hears both sides, applies hard math, delivers the verdict.",
              },
            ].map((p) => (
              <div
                key={p.name}
                className="rounded-xl border border-border bg-card p-6"
              >
                <p
                  className={`text-xs uppercase tracking-wide ${p.color} mb-3`}
                >
                  {p.tag}
                </p>
                <h3 className="text-lg font-semibold mb-2">{p.name}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {p.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="px-6 pb-24 max-w-5xl mx-auto">
          <h2 className="text-2xl font-semibold tracking-tight text-center mb-12">
            How it works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: Brain,
                title: "1. Brief the Council",
                desc: "Add your income, expenses, role, and savings goals. Log transactions as you go.",
              },
              {
                icon: Gavel,
                title: "2. Ask before you spend",
                desc: "Tell the Council what you want to buy. Watch them debate using your real data.",
              },
              {
                icon: Sparkles,
                title: "3. Decide with conviction",
                desc: "Accept the verdict, or appeal with new context. Either way, you spend on purpose.",
              },
            ].map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="space-y-3">
                  <div className="size-10 rounded-md bg-primary/10 border border-primary/20 grid place-items-center text-primary">
                    <Icon className="size-5" />
                  </div>
                  <h3 className="font-semibold">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-6 py-8 text-xs text-muted-foreground flex items-center justify-between">
        <p>© {new Date().getFullYear()} Fincil. Not financial advice.</p>
        <p>Built with Next.js, Supabase, OpenAI, and Gemini.</p>
      </footer>
    </div>
  );
}
