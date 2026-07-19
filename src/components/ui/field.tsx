import { cn } from "@/lib/utils";

const baseControl =
  "w-full rounded-xl border border-champagne-500/30 bg-cream-50/80 px-4 py-3 text-sm text-ink-800 shadow-inner outline-none transition placeholder:text-ink-700/40 focus:border-champagne-500 focus:ring-2 focus:ring-champagne-400/40 disabled:cursor-not-allowed disabled:opacity-60";

export function Label({
  children,
  htmlFor,
}: {
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-sm font-medium text-ink-700"
    >
      {children}
    </label>
  );
}

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(baseControl, className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={cn(baseControl, "min-h-28 resize-y", className)} {...props} />
  );
}

export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(baseControl, "appearance-none", className)} {...props} />;
}

export function PrimaryButton({
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-6 py-3 text-sm font-semibold text-cream-50 shadow-[0_14px_34px_-14px_rgba(43,26,18,0.85)] ring-1 ring-inset ring-champagne-400/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne-400/60 motion-safe:transition-transform motion-safe:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function FormError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-800"
    >
      {message}
    </div>
  );
}

export function FormSuccess({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="rounded-xl border border-emerald-600/30 bg-emerald-600/10 px-4 py-3 text-sm text-emerald-800"
    >
      {message}
    </div>
  );
}
