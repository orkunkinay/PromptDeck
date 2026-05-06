import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Database,
  Download,
  FileDiff,
  History,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload
} from "lucide-react";
import "../shared/styles.css";
import type { Prompt, PromptDeckSettings, PromptVariant, PromptVariableDefinition } from "../shared/models/prompt";
import {
  applyImportPlanToState,
  backupFilename,
  createBackup,
  createImportPlan,
  parseBackupFile,
  stringifyBackup,
  type ImportMode,
  type ImportPlan,
  validateBackup
} from "../shared/backup";
import { promptToMarkdown } from "../shared/importExport/markdown";
import { compilePrompt, ensureVariableDefinitions } from "../shared/promptCompiler/compiler";
import { searchPrompts } from "../shared/search/fuzzySearch";
import { defaultSettings } from "../shared/settings/defaultSettings";
import { settingsService } from "../shared/settings/settingsService";
import { createPromptFromCommand, promptRepository } from "../shared/storage/promptRepository";
import { limitPromptTitle, MAX_PROMPT_TITLE_LENGTH, nowIso } from "../shared/utils/id";
import { deleteVersion, diffLines, getDefaultVersion, restoreVersionAsLatest, setDefaultVersion } from "../shared/versioning/versionService";
import { removeVariant, upsertVariant } from "../shared/versioning/variantService";

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

function currentContent(prompt: Prompt): string {
  return getDefaultVersion(prompt)?.content || "";
}

function download(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function savePreImportSnapshot(prompts: Prompt[], settings: PromptDeckSettings): Promise<void> {
  const snapshot = stringifyBackup(createBackup(prompts, settings));
  const key = "promptdeck:last-pre-import-backup";
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    await chrome.storage.local.set({ [key]: snapshot });
    return;
  }
  localStorage.setItem(key, snapshot);
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

function Button({
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

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cx("rounded-2xl border border-[var(--pd-border)] bg-[var(--pd-surface)] shadow-[0_1px_2px_rgba(15,23,42,0.04)]", className)}>{children}</section>;
}

function SectionHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
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

function Field({
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

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(controlClass, "h-10", props.className)} />;
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(controlClass, "resize-y p-3 leading-6", props.className)} />;
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(controlClass, "h-10", props.className)} />;
}

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "blue" | "green" | "red" }) {
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

function SaveState({ status, dirty }: { status: string; dirty: boolean }) {
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

function AppShell({
  sidebar,
  children,
  rail,
  theme
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  rail?: React.ReactNode;
  theme: PromptDeckSettings["theme"];
}) {
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const dark = theme === "dark" || (theme === "system" && systemDark);

  return (
    <div className={cx("pd-manager h-screen overflow-hidden bg-[var(--pd-bg)] text-[var(--pd-text)]", dark && "dark")}>
      <div className="pd-shell-grid">
        {sidebar}
        <main className="pd-main-pane">{children}</main>
        {rail ? <aside className="pd-rail-pane hidden border-l border-[var(--pd-border)] bg-[var(--pd-surface-muted)] xl:block">{rail}</aside> : null}
      </div>
    </div>
  );
}

function Sidebar({
  prompts,
  results,
  selected,
  query,
  settings,
  status,
  onQuery,
  onSelect,
  onCreate,
  onSettings,
  onExportBackup,
  onExportMarkdown,
  onImport,
  onDeleteAll
}: {
  prompts: Prompt[];
  results: ReturnType<typeof searchPrompts>;
  selected?: Prompt;
  query: string;
  settings: PromptDeckSettings;
  status: string;
  onQuery(value: string): void;
  onSelect(id: string): void;
  onCreate(): void;
  onSettings(patch: Partial<PromptDeckSettings>): void;
  onExportBackup(): void;
  onExportMarkdown(): void;
  onImport(file: File): void;
  onDeleteAll(): void;
}) {
  return (
    <aside className="pd-sidebar border-r border-[var(--pd-border)] bg-[var(--pd-surface)]">
      <div className="border-b border-[var(--pd-border)] px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center overflow-hidden rounded-xl bg-[var(--pd-primary)] shadow-sm">
            <img src="/logo.png" alt="" className="h-full w-full object-cover" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-[-0.02em] text-[var(--pd-text)]">PromptDeck</h1>
            <p className="text-xs text-[var(--pd-text-muted)]">Local prompt command center</p>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--pd-text-muted)]" size={16} />
            <TextInput value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search prompts" className="pl-9" aria-label="Search prompts" />
          </div>
          <Button variant="primary" onClick={onCreate} aria-label="New prompt">
            <Plus size={16} />
          </Button>
        </div>
      </div>

      <div className="pd-sidebar-prompts px-3 py-3">
        <div className="mb-2 flex items-center justify-between px-2">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--pd-text-muted)]">Prompts</span>
          <span className="text-xs text-[var(--pd-text-muted)]">{prompts.length}</span>
        </div>
        <div className="space-y-1">
          {results.map((result) => (
            <button
              className="group w-full rounded-xl px-3 py-2.5 text-left text-[var(--pd-text)] transition hover:bg-[var(--pd-bg-subtle)] focus:outline-none focus:ring-2 focus:ring-blue-500"
              key={result.prompt.id}
              onClick={() => onSelect(result.prompt.id)}
            >
              <div className="flex items-center justify-between gap-3">
                <strong className="truncate text-sm font-medium">{result.prompt.title}</strong>
                <ChevronRight className="shrink-0 text-[var(--pd-text-muted)]" size={14} />
              </div>
              <div className="mt-1 truncate text-xs text-[var(--pd-text-muted)]">{result.prompt.command}</div>
            </button>
          ))}
          {results.length === 0 ? <div className="rounded-xl border border-dashed border-[var(--pd-border)] p-4 text-sm text-[var(--pd-text-muted)]">No prompts match your search.</div> : null}
        </div>
      </div>

      <div className="pd-sidebar-utilities border-t border-[var(--pd-border)] p-4">
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Settings size={15} className="text-[var(--pd-text-muted)]" />
            <h2 className="text-sm font-semibold text-[var(--pd-text)]">Workspace</h2>
          </div>
          <div className="space-y-3">
            <Field label="Trigger">
              <TextInput value={settings.trigger} onChange={(event) => onSettings({ trigger: event.target.value || ";;" })} aria-label="PromptDeck trigger" />
            </Field>
            <Field label="Insertion">
              <Select value={settings.insertionMode} onChange={(event) => onSettings({ insertionMode: event.target.value as PromptDeckSettings["insertionMode"] })}>
                <option value="prefer-direct">Prefer direct insertion</option>
                <option value="clipboard">Always copy</option>
                <option value="ask">Ask every time</option>
              </Select>
            </Field>
            <Field label="Theme">
              <Select value={settings.theme} onChange={(event) => onSettings({ theme: event.target.value as PromptDeckSettings["theme"] })}>
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </Select>
            </Field>
          </div>
        </Card>

        <Card className="mt-3 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Database size={15} className="text-[var(--pd-text-muted)]" />
            <h2 className="text-sm font-semibold text-[var(--pd-text)]">Backup & migration</h2>
          </div>
          <p className="mb-3 text-xs leading-5 text-[var(--pd-text-muted)]">Export your local library as a JSON backup. Import it on another browser or device to continue where you left off.</p>
          <div className="grid grid-cols-1 gap-2">
            <Button onClick={onExportBackup} className="w-full">
              <Download size={14} /> Export backup
            </Button>
            <label className="pd-button pd-button-secondary w-full cursor-pointer">
              <Upload size={14} /> Import backup
              <input type="file" accept="application/json" className="hidden" onChange={(event) => event.target.files?.[0] && onImport(event.target.files[0])} />
            </label>
            <Button onClick={onExportMarkdown} disabled={!selected} className="w-full">
              <Download size={14} /> Export selected Markdown
            </Button>
          </div>
          <p className="mt-3 text-xs leading-5 text-[var(--pd-text-muted)]">Backup files contain saved prompt text and settings. Store them somewhere safe.</p>
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-xs leading-5 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100">
            <div className="mb-1 flex items-center gap-1.5 font-medium">
              <ShieldCheck size={14} /> Local-first
            </div>
            Prompt content stays in this browser. No account, sync, or telemetry.
          </div>
          <div className="mt-3 border-t border-[var(--pd-border-subtle)] pt-3">
            <Button variant="danger" onClick={onDeleteAll} className="w-full justify-center">
              <Trash2 size={14} /> Delete all data
            </Button>
          </div>
          {status ? <p className="mt-3 text-xs text-[var(--pd-text-muted)]">{status}</p> : null}
        </Card>
      </div>
    </aside>
  );
}

function PromptEditor({
  prompt,
  status,
  onSave,
  onDelete
}: {
  prompt: Prompt;
  status: string;
  onSave(prompt: Prompt, content: string, minorEdit: boolean, changelog: string): Promise<void>;
  onDelete(id: string): Promise<void>;
}) {
  const [draft, setDraft] = useState(prompt);
  const [content, setContent] = useState(currentContent(prompt));
  const [minorEdit, setMinorEdit] = useState(false);
  const [changelog, setChangelog] = useState("Saved edit");

  useEffect(() => {
    setDraft(prompt);
    setContent(currentContent(prompt));
    setMinorEdit(false);
    setChangelog("Saved edit");
  }, [prompt]);

  const compiled = useMemo(() => compilePrompt({ content, definitions: draft.variables }), [content, draft.variables]);
  const dirty =
    draft.title !== prompt.title ||
    draft.command !== prompt.command ||
    draft.description !== prompt.description ||
    draft.aliases.join(",") !== prompt.aliases.join(",") ||
    draft.tags.join(",") !== prompt.tags.join(",") ||
    content !== currentContent(prompt);

  const save = async () => {
    const next = {
      ...draft,
      body: content,
      variables: ensureVariableDefinitions(content, draft.variables),
      updatedAt: nowIso()
    };
    await onSave(next, content, minorEdit, changelog);
  };

  const addVariant = () => {
    setDraft(
      upsertVariant(draft, {
        name: "Short",
        suffix: "short",
        content,
        description: "Alternative prompt"
      })
    );
  };

  const updateVariant = (variant: PromptVariant, patch: Partial<PromptVariant>) => {
    setDraft(upsertVariant(draft, { ...variant, ...patch }));
  };

  const setVariable = (name: string, patch: Partial<PromptVariableDefinition>) => {
    setDraft({
      ...draft,
      variables: {
        ...draft.variables,
        [name]: { ...draft.variables[name], name, required: true, ...patch }
      }
    });
  };

  return (
    <div className="mx-auto max-w-5xl px-5 py-6 lg:px-8 lg:py-7">
      <header className="mb-7 flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex items-center gap-2">
            <Badge tone="green">Local-first</Badge>
            <Badge>{draft.versions.length} versions</Badge>
            <Badge>{draft.usageCount || 0} uses</Badge>
          </div>
          <input
            className="w-full border-0 bg-transparent p-0 text-3xl font-semibold tracking-[-0.04em] text-[var(--pd-text)] outline-none placeholder:text-[var(--pd-text-subtle)] focus:ring-0"
            value={draft.title}
            maxLength={MAX_PROMPT_TITLE_LENGTH}
            onChange={(event) => setDraft({ ...draft, title: limitPromptTitle(event.target.value) })}
            aria-label="Prompt title"
          />
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--pd-text-muted)]">Edit the reusable prompt that appears in the browser autocomplete. Saves create a new immutable version unless you mark the change as minor.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SaveState status={status} dirty={dirty} />
          <Button variant="danger" onClick={() => onDelete(draft.id)}>
            <Trash2 size={15} /> Delete
          </Button>
          <Button variant="primary" onClick={save}>
            <Save size={15} /> Save
          </Button>
        </div>
      </header>

      <div className="space-y-5">
        <Card className="p-5">
          <SectionHeader title="Prompt details" description="Keep commands short and memorable. Aliases and tags improve autocomplete ranking." />
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field label="Command" hint="Internal prompt command. The browser trigger remains configurable, default ;;.">
              <TextInput value={draft.command} onChange={(event) => setDraft({ ...draft, command: event.target.value })} />
            </Field>
            <Field label="Aliases" hint="Comma-separated shortcuts, for example /paper, /read-paper.">
              <TextInput value={draft.aliases.join(", ")} onChange={(event) => setDraft({ ...draft, aliases: event.target.value.split(",").map((alias) => alias.trim()).filter(Boolean) })} />
            </Field>
            <Field label="Tags">
              <TextInput value={draft.tags.join(", ")} onChange={(event) => setDraft({ ...draft, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} />
            </Field>
            <Field label="Description">
              <TextInput value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
            </Field>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-[var(--pd-border)] p-5">
            <SectionHeader title="Prompt content" description="This text is inserted exactly as saved. Placeholder tokens like {{paper_text}} are preserved." />
          </div>
          <TextArea value={content} onChange={(event) => setContent(event.target.value)} className="h-[360px] rounded-none border-0 bg-[var(--pd-surface)] p-5 font-mono text-[13px] text-[var(--pd-text)] shadow-none focus:border-transparent focus:ring-0" />
          <div className="flex flex-wrap items-center gap-3 border-t border-[var(--pd-border)] bg-[var(--pd-surface-muted)] p-4">
            <Field label="Version note" className="min-w-[260px] flex-1">
              <TextInput value={changelog} onChange={(event) => setChangelog(event.target.value)} aria-label="Changelog" />
            </Field>
            <label className="mt-5 inline-flex items-center gap-2 rounded-xl border border-[var(--pd-border)] bg-[var(--pd-surface-elevated)] px-3 py-2 text-sm text-[var(--pd-text)] shadow-sm">
              <input className="h-4 w-4 rounded border-[var(--pd-border)] bg-[var(--pd-surface)] text-blue-600 focus:ring-blue-500" type="checkbox" checked={minorEdit} onChange={(event) => setMinorEdit(event.target.checked)} />
              Minor edit without version
            </label>
          </div>
        </Card>

        <Card className="p-5">
          <SectionHeader title="Placeholders" description="Detected from double-brace tokens. They are not prompted for during insertion; they remain in the prompt text." action={<Badge tone="blue">{compiled.variables.length} detected</Badge>} />
          <div className="mt-5 overflow-hidden rounded-xl border border-[var(--pd-border)]">
            {compiled.variables.length === 0 ? (
              <div className="p-4 text-sm text-[var(--pd-text-muted)]">No placeholders detected in this prompt.</div>
            ) : (
              compiled.variables.map((name) => {
                const variable = draft.variables[name] || { name, required: true };
                return (
                  <div className="grid gap-3 border-b border-[var(--pd-border-subtle)] p-3 last:border-b-0 md:grid-cols-[1fr_150px_1.4fr]" key={name}>
                    <div className="flex items-center">
                      <code className="rounded-lg bg-[var(--pd-bg-subtle)] px-2 py-1 text-xs font-semibold text-[var(--pd-text)]">{`{{${name}}}`}</code>
                    </div>
                    <Select value={variable.inputKind || "text"} onChange={(event) => setVariable(name, { inputKind: event.target.value as PromptVariableDefinition["inputKind"] })}>
                      <option value="text">Text</option>
                      <option value="textarea">Textarea</option>
                      <option value="select">Select</option>
                    </Select>
                    <TextInput value={variable.defaultValue || ""} onChange={(event) => setVariable(name, { defaultValue: event.target.value })} placeholder="Default value metadata" />
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <Card className="p-5">
          <SectionHeader
            title="Variants"
            description="Intentional alternatives such as short, latex, academic, or prod."
            action={
              <Button onClick={addVariant}>
                <Plus size={15} /> Add variant
              </Button>
            }
          />
          <div className="mt-5 space-y-3">
            {draft.variants.length === 0 ? <div className="rounded-xl border border-dashed border-[var(--pd-border)] p-4 text-sm text-[var(--pd-text-muted)]">No variants yet.</div> : null}
            {draft.variants.map((variant) => (
              <div className="rounded-2xl border border-[var(--pd-border)] bg-[var(--pd-surface-muted)] p-4" key={variant.id}>
                <div className="grid gap-3 md:grid-cols-[1fr_160px_auto]">
                  <TextInput value={variant.name} onChange={(event) => updateVariant(variant, { name: event.target.value })} aria-label="Variant name" />
                  <TextInput value={variant.suffix} onChange={(event) => updateVariant(variant, { suffix: event.target.value })} aria-label="Variant suffix" />
                  <Button variant="ghost" onClick={() => setDraft(removeVariant(draft, variant.id))}>
                    Remove
                  </Button>
                </div>
                <TextArea className="mt-3 h-28 font-mono text-[13px]" value={variant.content} onChange={(event) => updateVariant(variant, { content: event.target.value })} />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function VersionRail({ prompt, onDraftChange }: { prompt: Prompt; onDraftChange(prompt: Prompt): void }) {
  const [leftVersion, setLeftVersion] = useState(prompt.versions[0]?.id || "v1");
  const [rightVersion, setRightVersion] = useState(prompt.defaultVersionId);

  useEffect(() => {
    setLeftVersion(prompt.versions[0]?.id || "v1");
    setRightVersion(prompt.defaultVersionId);
  }, [prompt]);

  const left = prompt.versions.find((version) => version.id === leftVersion)?.content || "";
  const right = prompt.versions.find((version) => version.id === rightVersion)?.content || "";
  const diff = diffLines(left, right);
  const canDeleteVersions = prompt.versions.length > 1;

  function handleDeleteVersion(versionId: string): void {
    if (!canDeleteVersions) return;
    const version = prompt.versions.find((candidate) => candidate.id === versionId);
    const label = version?.label ? `${versionId} (${version.label})` : versionId;
    const defaultWarning = versionId === prompt.defaultVersionId ? " This is the current default, so the newest remaining version will become default." : "";
    if (!confirm(`Delete version ${label}? This only deletes this saved version history entry.${defaultWarning}`)) return;
    onDraftChange(deleteVersion(prompt, versionId));
  }

  return (
    <div className="space-y-4 p-4 lg:p-5">
      <Card className="p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <History size={16} className="text-[var(--pd-text-muted)]" />
            <h2 className="text-sm font-semibold text-[var(--pd-text)]">Versions</h2>
          </div>
          <span className="shrink-0 text-xs font-medium text-[var(--pd-text-muted)]">{prompt.versions.length}</span>
        </div>
        <div className="max-h-[380px] space-y-2 overflow-y-auto pr-1">
          {prompt.versions.map((version) => (
            <div className="rounded-xl border border-[var(--pd-border)] bg-[var(--pd-surface-elevated)] p-3" key={version.id}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <strong className="text-sm text-[var(--pd-text)]">{version.id}</strong>
                  {version.id === prompt.defaultVersionId ? <Badge tone="blue">default</Badge> : null}
                </div>
                <span className="text-xs text-[var(--pd-text-muted)]">{new Date(version.createdAt).toLocaleDateString()}</span>
              </div>
              <input
                className="mt-2 w-full border-0 bg-transparent p-0 text-sm font-medium text-[var(--pd-text)] outline-none focus:ring-0"
                value={version.label}
                onChange={(event) => onDraftChange({ ...prompt, versions: prompt.versions.map((item) => (item.id === version.id ? { ...item, label: event.target.value } : item)) })}
                aria-label={`${version.id} label`}
              />
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--pd-text-muted)]">{version.changelog || "No changelog note."}</p>
              <div className="mt-3 flex gap-2">
                <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => onDraftChange(setDefaultVersion(prompt, version.id))}>
                  Default
                </Button>
                <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => onDraftChange(restoreVersionAsLatest(prompt, version.id))}>
                  <RotateCcw size={13} /> Restore
                </Button>
                <Button
                  variant="ghost"
                  className="ml-auto h-8 px-2 text-xs text-[var(--pd-danger)] hover:border-[var(--pd-danger)] hover:text-[var(--pd-danger)]"
                  disabled={!canDeleteVersions}
                  onClick={() => handleDeleteVersion(version.id)}
                  title={canDeleteVersions ? `Delete ${version.id}` : "A prompt must keep at least one version"}
                >
                  <Trash2 size={13} /> Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <div className="mb-4 flex items-center gap-2">
          <FileDiff size={16} className="text-[var(--pd-text-muted)]" />
          <h2 className="text-sm font-semibold text-[var(--pd-text)]">Compare</h2>
        </div>
        <div className="grid grid-cols-1 gap-2 2xl:grid-cols-2">
          <Select value={leftVersion} onChange={(event) => setLeftVersion(event.target.value)} aria-label="Left version">
            {prompt.versions.map((version) => (
              <option key={version.id}>{version.id}</option>
            ))}
          </Select>
          <Select value={rightVersion} onChange={(event) => setRightVersion(event.target.value)} aria-label="Right version">
            {prompt.versions.map((version) => (
              <option key={version.id}>{version.id}</option>
            ))}
          </Select>
        </div>
        <pre className="mt-3 max-h-[360px] overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs leading-5 text-slate-100">
          {diff.map((line) => `${line.type === "add" ? "+ " : line.type === "remove" ? "- " : "  "}${line.text}`).join("\n")}
        </pre>
      </Card>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate(): void }) {
  return (
    <main className="grid h-full place-items-center p-8">
      <Card className="max-w-md p-8 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--pd-primary)] text-[var(--pd-primary-foreground)]">
          <Sparkles size={20} />
        </div>
        <h2 className="mt-5 text-xl font-semibold tracking-[-0.02em] text-[var(--pd-text)]">Create your first prompt</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--pd-text-muted)]">Save reusable prompts, trigger them with ;;, and keep everything local to this browser.</p>
        <Button variant="primary" onClick={onCreate} className="mt-5">
          <Plus size={15} /> New prompt
        </Button>
      </Card>
    </main>
  );
}

function commandExists(prompts: Prompt[], command: string): boolean {
  const normalized = command.toLowerCase();
  return prompts.some((prompt) => {
    const values = [prompt.command, ...prompt.aliases].map((value) => value.toLowerCase());
    return values.includes(normalized);
  });
}

function nextBlankPromptCommand(prompts: Prompt[]): string {
  if (!commandExists(prompts, "/new-prompt")) return "/new-prompt";
  let index = 2;
  while (commandExists(prompts, `/new-prompt-${index}`)) {
    index += 1;
  }
  return `/new-prompt-${index}`;
}

function ImportPreviewModal({
  fileName,
  plan,
  mode,
  confirmation,
  onMode,
  onConfirmation,
  onCancel,
  onApply
}: {
  fileName: string;
  plan: ImportPlan;
  mode: ImportMode;
  confirmation: string;
  onMode(mode: ImportMode): void;
  onConfirmation(value: string): void;
  onCancel(): void;
  onApply(): void;
}) {
  const destructive = mode === "replace";
  const canApply = !destructive || confirmation === "REPLACE";

  const strategies: Array<{ mode: ImportMode; title: string; description: string; recommended?: boolean; danger?: boolean }> = [
    {
      mode: "merge-safe",
      title: "Merge safely",
      description: "Add new prompts and keep your current local prompts when there is a conflict.",
      recommended: true
    },
    {
      mode: "merge-update",
      title: "Merge and update",
      description: "Add new prompts and replace matching local prompts with the backup version."
    },
    {
      mode: "replace",
      title: "Replace all local data",
      description: "Delete current local PromptDeck data and restore the backup exactly.",
      danger: true
    }
  ];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-6 backdrop-blur-sm">
      <div className="max-h-[88vh] w-full max-w-3xl overflow-auto rounded-3xl border border-[var(--pd-border)] bg-[var(--pd-surface)] shadow-2xl">
        <div className="border-b border-[var(--pd-border)] p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Badge tone="blue">Import preview</Badge>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[var(--pd-text)]">Backup & migration</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--pd-text-muted)]">Importing changes only this browser’s local PromptDeck data. Nothing is uploaded.</p>
            </div>
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-[1fr_1.2fr] md:p-6">
          <Card className="p-4">
            <SectionHeader title="Backup file" description={fileName} />
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--pd-text-muted)]">Exported</dt>
                <dd className="font-medium text-[var(--pd-text)]">{new Date(plan.backup.exportedAt).toLocaleString()}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--pd-text-muted)]">Schema</dt>
                <dd className="font-medium text-[var(--pd-text)]">v{plan.backup.schemaVersion}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--pd-text-muted)]">Prompts</dt>
                <dd className="font-medium text-[var(--pd-text)]">{plan.summary.promptCount}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--pd-text-muted)]">Versions</dt>
                <dd className="font-medium text-[var(--pd-text)]">{plan.summary.versionCount}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--pd-text-muted)]">Settings</dt>
                <dd className="font-medium text-[var(--pd-text)]">{plan.summary.settingsIncluded ? "Included" : "Not included"}</dd>
              </div>
            </dl>
          </Card>

          <Card className="p-4">
            <SectionHeader title="Import impact" description="Review what will be added, skipped, updated, or replaced before applying." />
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-[var(--pd-bg-subtle)] p-3">
                <div className="text-2xl font-semibold text-[var(--pd-text)]">{plan.summary.newPromptCount}</div>
                <div className="text-xs text-[var(--pd-text-muted)]">new prompts</div>
              </div>
              <div className="rounded-2xl bg-[var(--pd-bg-subtle)] p-3">
                <div className="text-2xl font-semibold text-[var(--pd-text)]">{plan.summary.unchangedPromptCount}</div>
                <div className="text-xs text-[var(--pd-text-muted)]">unchanged</div>
              </div>
              <div className="rounded-2xl bg-[var(--pd-bg-subtle)] p-3">
                <div className="text-2xl font-semibold text-[var(--pd-text)]">{plan.summary.mergedPromptCount}</div>
                <div className="text-xs text-[var(--pd-text-muted)]">version merges</div>
              </div>
              <div className="rounded-2xl bg-[var(--pd-bg-subtle)] p-3">
                <div className="text-2xl font-semibold text-[var(--pd-text)]">{plan.summary.conflictCount}</div>
                <div className="text-xs text-[var(--pd-text-muted)]">conflicts</div>
              </div>
              <div className="rounded-2xl bg-[var(--pd-bg-subtle)] p-3">
                <div className="text-2xl font-semibold text-[var(--pd-text)]">{plan.summary.newerLocalCount}</div>
                <div className="text-xs text-[var(--pd-text-muted)]">newer local</div>
              </div>
              <div className="rounded-2xl bg-[var(--pd-bg-subtle)] p-3">
                <div className="text-2xl font-semibold text-[var(--pd-text)]">{plan.summary.settingsChangeCount}</div>
                <div className="text-xs text-[var(--pd-text-muted)]">settings changes</div>
              </div>
            </div>
            {plan.conflicts.length ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                {plan.conflicts.slice(0, 3).map((conflict) => (
                  <div key={`${conflict.importedPromptId}-${conflict.localPromptId}`}>
                    Conflict by {conflict.reason}: backup <strong>{conflict.importedPromptId}</strong> matches local <strong>{conflict.localPromptId}</strong>
                    {conflict.localIsNewer ? " (local appears newer)" : ""}.
                  </div>
                ))}
                {plan.conflicts.length > 3 ? <div>And {plan.conflicts.length - 3} more conflicts.</div> : null}
              </div>
            ) : null}
          </Card>
        </div>

        <div className="border-t border-[var(--pd-border)] p-6">
          <h3 className="text-sm font-semibold text-[var(--pd-text)]">Choose import strategy</h3>
          <div className="mt-3 grid gap-3">
            {strategies.map((strategy) => (
              <button
                key={strategy.mode}
                className={cx(
                  "rounded-2xl border p-4 text-left transition",
                  mode === strategy.mode ? "border-blue-500 bg-blue-50 ring-4 ring-blue-500/10 dark:bg-blue-950/30" : "border-[var(--pd-border)] bg-[var(--pd-surface-elevated)] hover:bg-[var(--pd-surface-muted)]"
                )}
                onClick={() => onMode(strategy.mode)}
              >
                <div className="flex items-center gap-2">
                  <strong className={cx("text-sm", strategy.danger ? "text-red-700 dark:text-red-300" : "text-[var(--pd-text)]")}>{strategy.title}</strong>
                  {strategy.recommended ? <Badge tone="green">Recommended</Badge> : null}
                </div>
                <p className="mt-1 text-sm leading-5 text-[var(--pd-text-muted)]">{strategy.description}</p>
              </button>
            ))}
          </div>

          {destructive ? (
            <Field label="Confirm replace" hint="Type REPLACE to delete current local data and restore this backup. A safety snapshot is saved first." className="mt-4">
              <TextInput value={confirmation} onChange={(event) => onConfirmation(event.target.value)} placeholder="REPLACE" />
            </Field>
          ) : null}

          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant={destructive ? "danger" : "primary"} disabled={!canApply} onClick={onApply}>
              Apply import
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [settings, setSettings] = useState<PromptDeckSettings>(defaultSettings);
  const [selectedId, setSelectedId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [pendingImport, setPendingImport] = useState<{ fileName: string; plan: ImportPlan } | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("merge-safe");
  const [replaceConfirmation, setReplaceConfirmation] = useState("");

  const selected = prompts.find((prompt) => prompt.id === selectedId) || prompts[0];
  const results = useMemo(() => searchPrompts(prompts, query), [prompts, query]);

  const load = async () => {
    const [nextPrompts, nextSettings] = await Promise.all([promptRepository.list(), settingsService.get()]);
    setPrompts(nextPrompts);
    setSettings(nextSettings);
    setSelectedId((current) => current || nextPrompts[0]?.id || "");
  };

  useEffect(() => {
    void load();
  }, []);

  const savePrompt = async (prompt: Prompt, content: string, minorEdit: boolean, changelog: string) => {
    setStatus("Saving...");
    try {
      const saved = await promptRepository.save(prompt, { content, minorEdit, changelog });
      await load();
      setSelectedId(saved.id);
      setStatus("Saved locally");
      window.setTimeout(() => setStatus(""), 1800);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Save failed");
    }
  };

  const createPrompt = async () => {
    const prompt = createPromptFromCommand(nextBlankPromptCommand(prompts));
    const saved = await promptRepository.save(prompt, { minorEdit: true });
    await load();
    setSelectedId(saved.id);
  };

  const deletePrompt = async (id: string) => {
    if (!confirm("Delete this prompt and all versions locally?")) return;
    await promptRepository.delete(id);
    await load();
  };

  const exportBackup = () => {
    download(backupFilename(), stringifyBackup(createBackup(prompts, settings)));
    setStatus("Backup exported");
    window.setTimeout(() => setStatus(""), 1800);
  };

  const previewBackupImport = async (file: File) => {
    try {
      const raw = await parseBackupFile(file);
      const validation = validateBackup(raw);
      if (!validation.ok) {
        setStatus(validation.errors.join(" "));
        return;
      }
      setPendingImport({ fileName: file.name, plan: createImportPlan(prompts, settings, validation.backup) });
      setImportMode("merge-safe");
      setReplaceConfirmation("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Import failed");
    }
  };

  const applyBackupImport = async () => {
    if (!pendingImport) return;
    if (importMode === "replace" && replaceConfirmation !== "REPLACE") return;

    try {
      await savePreImportSnapshot(prompts, settings);
      const result = applyImportPlanToState(pendingImport.plan, importMode);
      await promptRepository.replaceAll(result.prompts);
      await settingsService.save(result.settings);
      await load();
      setPendingImport(null);
      setStatus(
        importMode === "merge-safe"
          ? `Import complete: ${result.importedPromptCount} added, ${result.skippedConflictCount} skipped`
          : `Import complete: ${result.importedPromptCount} imported`
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Import failed before changes could be saved.");
    }
  };

  const updateSettings = async (patch: Partial<PromptDeckSettings>) => {
    const next = await settingsService.save({ ...settings, ...patch });
    setSettings(next);
  };

  const updateSelectedDraftFromRail = (prompt: Prompt) => {
    setPrompts((items) => items.map((item) => (item.id === prompt.id ? prompt : item)));
  };

  return (
    <AppShell
      sidebar={
        <Sidebar
          prompts={prompts}
          results={results}
          selected={selected}
          query={query}
          settings={settings}
          status={status}
          onQuery={setQuery}
          onSelect={setSelectedId}
          onCreate={createPrompt}
          onSettings={(patch) => void updateSettings(patch)}
          onExportBackup={exportBackup}
          onExportMarkdown={() => selected && download(`${selected.id}.md`, promptToMarkdown(selected))}
          onImport={(file) => void previewBackupImport(file)}
          onDeleteAll={async () => {
            if (confirm("Delete all PromptDeck data from this browser?")) {
              await promptRepository.replaceAll([]);
              await load();
            }
          }}
        />
      }
      rail={selected ? <VersionRail prompt={selected} onDraftChange={updateSelectedDraftFromRail} /> : undefined}
      theme={settings.theme}
    >
      {selected ? <PromptEditor prompt={selected} status={status} onSave={savePrompt} onDelete={deletePrompt} /> : <EmptyState onCreate={createPrompt} />}
      {pendingImport ? (
        <ImportPreviewModal
          fileName={pendingImport.fileName}
          plan={pendingImport.plan}
          mode={importMode}
          confirmation={replaceConfirmation}
          onMode={setImportMode}
          onConfirmation={setReplaceConfirmation}
          onCancel={() => setPendingImport(null)}
          onApply={() => void applyBackupImport()}
        />
      ) : null}
    </AppShell>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
