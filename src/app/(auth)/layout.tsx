import { Logo } from "@/components/layout/site-chrome";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="px-6 py-5"><Logo /></header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:pt-12">
        <div className="w-full max-w-md rounded-[1.75rem] bg-white p-7 shadow-card ring-1 ring-black/4 sm:p-10">{children}</div>
      </main>
    </div>
  );
}
