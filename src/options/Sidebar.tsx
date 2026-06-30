import { ChevronRight, Database, Download, Plus, Search, Settings, ShieldCheck, Trash2, Upload } from "lucide-react";
import type { Prompt, PromptDeckSettings } from "../shared/models/prompt";
import { searchPrompts } from "../shared/search/fuzzySearch";
import { Badge, Button, Card, Field, Select, TextInput } from "./ui";

export function Sidebar({
  prompts,
  results,
  selected,
  query,
  settings,
  status,
  creatingPrompt,
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
  creatingPrompt?: boolean;
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
          <Button variant="primary" onClick={onCreate} aria-label="New prompt" disabled={creatingPrompt}>
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
