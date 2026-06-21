import React from "react";
import { AlertTriangle, Check } from "lucide-react";

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  children,
  variant = "secondary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      className={cx(
        "pd-button",
        variant === "primary" && "pd-button-primary",
        variant === "secondary" && "pd-button-secondary",
        variant === "ghost" && "pd-button-ghost",
        variant === "danger" && "pd-button-danger",
        className
      )}
    >
      {children}
    </button>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cx("rounded-2xl border border-[var(--pd-border)] bg-[var(--pd-surface)] shadow-[0_1px_2px_rgba(15,23,42,0.04)]", className)}>{children}</section>;
}

export function SectionHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-sm font-semibold tracking-[-0.01em] text-[var(--pd-text)]">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-5 text-[var(--pd-text-muted)]">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  className
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--pd-text-muted)]">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint ? <span className="mt-1.5 block text-xs leading-5 text-[var(--pd-text-muted)]">{hint}</span> : null}
    </label>
  );
}

const controlClass =
  "w-full rounded-xl border border-[var(--pd-border)] bg-[var(--pd-surface-elevated)] px-3 text-sm text-[var(--pd-text)] shadow-sm outline-none transition placeholder:text-[var(--pd-text-subtle)] focus:border-blue-500 focus:ring-4 focus:ring-[var(--pd-focus-ring)]";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(controlClass, "h-10", props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(controlClass, "resize-y p-3 leading-6", props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(controlClass, "h-10", props.className)} />;
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "blue" | "green" | "red" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold leading-5",
        tone === "neutral" && "bg-[var(--pd-bg-subtle)] text-[var(--pd-text-muted)]",
        tone === "blue" && "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
        tone === "green" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
        tone === "red" && "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
      )}
    >
      {children}
    </span>
  );
}

export function SaveState({ status, dirty }: { status: string; dirty: boolean }) {
  if (status) {
    const error = /fail|collision|error|missing/i.test(status);
    return (
      <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", error ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200")}>
        {error ? <AlertTriangle size={13} /> : <Check size={13} />}
        {status}
      </span>
    );
  }
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", dirty ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" : "bg-[var(--pd-bg-subtle)] text-[var(--pd-text-muted)]")}>
      {dirty ? "Unsaved changes" : "Saved"}
    </span>
  );
}
