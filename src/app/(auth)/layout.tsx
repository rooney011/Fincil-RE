import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 flex items-center px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="size-7 rounded-md bg-primary/15 border border-primary/30 grid place-items-center">
            <span className="text-primary text-sm font-semibold">F</span>
          </div>
          <span className="font-semibold tracking-tight">Fincil</span>
        </Link>
      </header>
      <div className="flex-1 grid place-items-center px-6 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
