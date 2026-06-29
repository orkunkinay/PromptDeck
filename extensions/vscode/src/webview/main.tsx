import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Copy,
  Database,
  Download,
  FileDiff,
  History,
  Plus,
  Save,
  Search,
  Settings,
  Trash2,
  Upload,
  Wand2
} from "lucide-react";
import type { Prompt, PromptDeckSettings, PromptVariableDefinition, PromptVariant } from "../../../../src/shared/models/prompt";
import { compilePrompt, ensureVariableDefinitions } from "../../../../src/shared/promptCompiler/compiler";
import { searchPrompts } from "../../../../src/shared/search/fuzzySearch";
import { defaultSettings } from "../../../../src/shared/settings/defaultSettings";
import { removeVariant, upsertVariant } from "../../../../src/shared/versioning/variantService";
import {
  deleteVersion,
  diffLines,
  getDefaultVersion,
  restoreVersionAsLatest,
  setDefaultVersion
} from "../../../../src/shared/versioning/versionService";
import { limitPromptTitle, MAX_PROMPT_TITLE_LENGTH, nowIso } from "../../../../src/shared/utils/id";
import "./styles.css";

type ImportMode = "merge-safe" | "merge-update" | "replace";

interface LibraryState {
  prompts: Prompt[];
  settings: PromptDeckSettings;
  libraryPath: string;
}

interface VsCodeApi {
  postMessage(message: unknown): void;
}

declare const acquireVsCodeApi: () => VsCodeApi;

const vscode = acquireVsCodeApi();
const root = document.getElementById("root");
const logoUri = root?.dataset.logoUri || "";
let sequence = 0;
const pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void }>();

function request<T>(type: string, payload: Record<string, unknown> = {}): Promise<T> {
  const id = `${Date.now().toString(36)}-${sequence++}`;
  vscode.postMessage({ id, type, ...payload });
  return new Promise((resolve, reject) => pending.set(id, { resolve: resolve as (value: unknown) => void, reject }));
}

window.addEventListener("message", (event: MessageEvent) => {
  const message = event.data as { type?: string; id?: string; ok?: boolean; result?: unknown; error?: string };
  if (message.type !== "RESPONSE" || !message.id) return;
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  if (message.ok) waiter.resolve(message.result);
  else waiter.reject(new Error(message.error || "PromptDeck request failed"));
});

function currentContent(prompt: Prompt): string {
  return getDefaultVersion(prompt)?.content || prompt.body || "";
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function download(filename: string, content: string): void {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function Button({
  children,
  variant = "secondary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return (
    <button {...props} className={`pd-btn pd-btn-${variant} ${props.className || ""}`}>
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="pd-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Sidebar({
  prompts,
  selected,
  query,
  settings,
  status,
  libraryPath,
  onQuery,
  onSelect,
  onCreate,
  onSettings,
  onImport,
  onExport,
  onOpenLibrary,
  logoUri
}: {
  prompts: Prompt[];
  selected?: Prompt;
  query: string;
  settings: PromptDeckSettings;
  status: string;
  libraryPath: string;
  onQuery(value: string): void;
  onSelect(id: string): void;
  onCreate(): void;
  onSettings(patch: Partial<PromptDeckSettings>): void;
  onImport(file: File, mode: ImportMode): void;
  onExport(): void;
  onOpenLibrary(): void;
  logoUri: string;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const results = useMemo(() => searchPrompts(prompts, query), [prompts, query]);
  const [mode, setMode] = useState<ImportMode>("merge-safe");

  return (
    <aside className="pd-sidebar">
      <header className="pd-sidebar-header">
        <div className="pd-brand">
          {logoUri ? <img className="pd-brand-logo" src={logoUri} alt="" aria-hidden="true" /> : <div className="pd-brand-mark">P</div>}
          <div>
            <h1>PromptDeck</h1>
            <p>Central prompt library</p>
          </div>
        </div>
        <div className="pd-library-path" title={libraryPath}>
          <Database size={14} />
          <span>{libraryPath}</span>
        </div>
        <div className="pd-search-row">
          <Search size={16} />
          <input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search prompts" />
          <Button variant="primary" aria-label="New prompt" onClick={onCreate}>
            <Plus size={16} />
          </Button>
        </div>
      </header>

      <div className="pd-list">
        <div className="pd-list-meta">
          <span>Prompts</span>
          <span>{prompts.length}</span>
        </div>
        {results.map((result) => (
          <button
            className={`pd-list-item ${selected?.id === result.prompt.id ? "is-selected" : ""}`}
            key={result.prompt.id}
            onClick={() => onSelect(result.prompt.id)}
          >
            <strong>{result.prompt.title}</strong>
            <span>{result.prompt.command}</span>
          </button>
        ))}
        {results.length === 0 ? <div className="pd-empty-list">No prompts match your search.</div> : null}
      </div>

      <footer className="pd-utilities">
        <section className="pd-card">
          <h2>
            <Settings size={15} /> Settings
          </h2>
          <Field label="Trigger">
            <input value={settings.trigger} onChange={(event) => onSettings({ trigger: event.target.value || ";;" })} />
          </Field>
          <Field label="Insertion">
            <select
              value={settings.insertionMode}
              onChange={(event) => onSettings({ insertionMode: event.target.value as PromptDeckSettings["insertionMode"] })}
            >
              <option value="prefer-direct">Prefer direct insertion</option>
              <option value="clipboard">Always copy</option>
              <option value="ask">Ask every time</option>
            </select>
          </Field>
          <Field label="Theme">
            <select value={settings.theme} onChange={(event) => onSettings({ theme: event.target.value as PromptDeckSettings["theme"] })}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </Field>
        </section>

        <section className="pd-card">
          <h2>
            <Database size={15} /> Backup
          </h2>
          <div className="pd-button-grid">
            <Button onClick={onExport}>
              <Download size={14} /> Export
            </Button>
            <Button onClick={() => fileInput.current?.click()}>
              <Upload size={14} /> Import
            </Button>
          </div>
          <select value={mode} onChange={(event) => setMode(event.target.value as ImportMode)} aria-label="Import mode">
            <option value="merge-safe">Merge safe</option>
            <option value="merge-update">Merge update</option>
            <option value="replace">Replace</option>
          </select>
          <Button variant="ghost" onClick={onOpenLibrary}>
            Open library.json
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImport(file, mode);
              event.currentTarget.value = "";
            }}
          />
          {status ? <p className="pd-status">{status}</p> : null}
        </section>
      </footer>
    </aside>
  );
}

function PromptEditor({
  prompt,
  status,
  onSave,
  onDelete,
  onDuplicate,
  onInsert,
  onCopy
}: {
  prompt: Prompt;
  status: string;
  onSave(prompt: Prompt, content: string, minorEdit: boolean, changelog: string): Promise<void>;
  onDelete(id: string): Promise<void>;
  onDuplicate(id: string): Promise<void>;
  onInsert(command: string): Promise<void>;
  onCopy(command: string): Promise<void>;
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
    draft.variants !== prompt.variants ||
    content !== currentContent(prompt);

  const save = async () => {
    await onSave(
      {
        ...draft,
        body: content,
        variables: ensureVariableDefinitions(content, draft.variables),
        updatedAt: nowIso()
      },
      content,
      minorEdit,
      changelog
    );
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
    <main className="pd-editor">
      <header className="pd-editor-header">
        <div>
          <div className="pd-badges">
            <span>Local file</span>
            <span>{draft.versions.length} versions</span>
            <span>{draft.usageCount || 0} uses</span>
          </div>
          <input
            className="pd-title-input"
            value={draft.title}
            maxLength={MAX_PROMPT_TITLE_LENGTH}
            onChange={(event) => setDraft({ ...draft, title: limitPromptTitle(event.target.value) })}
          />
        </div>
        <div className="pd-actions">
          <span className={`pd-save-state ${dirty ? "is-dirty" : ""}`}>{status || (dirty ? "Unsaved" : "Saved")}</span>
          <Button onClick={() => onInsert(draft.command)}>
            <Wand2 size={15} /> Insert
          </Button>
          <Button onClick={() => onCopy(draft.command)}>
            <Copy size={15} /> Copy
          </Button>
          <Button onClick={() => onDuplicate(draft.command)}>Duplicate</Button>
          <Button variant="danger" onClick={() => onDelete(draft.command)}>
            <Trash2 size={15} /> Delete
          </Button>
          <Button variant="primary" onClick={save}>
            <Save size={15} /> Save
          </Button>
        </div>
      </header>

      <section className="pd-card pd-details">
        <h2>Prompt details</h2>
        <div className="pd-form-grid">
          <Field label="Command">
            <input value={draft.command} onChange={(event) => setDraft({ ...draft, command: event.target.value })} />
          </Field>
          <Field label="Aliases">
            <input value={draft.aliases.join(", ")} onChange={(event) => setDraft({ ...draft, aliases: splitCsv(event.target.value) })} />
          </Field>
          <Field label="Tags">
            <input value={draft.tags.join(", ")} onChange={(event) => setDraft({ ...draft, tags: splitCsv(event.target.value) })} />
          </Field>
          <Field label="Description">
            <input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </Field>
        </div>
      </section>

      <section className="pd-card pd-content">
        <div className="pd-section-header">
          <h2>Prompt content</h2>
          <span>Use placeholders like {"{{input}}"}</span>
        </div>
        <textarea value={content} onChange={(event) => setContent(event.target.value)} spellCheck={false} />
        <div className="pd-version-row">
          <Field label="Version note">
            <input value={changelog} onChange={(event) => setChangelog(event.target.value)} />
          </Field>
          <label className="pd-checkbox">
            <input type="checkbox" checked={minorEdit} onChange={(event) => setMinorEdit(event.target.checked)} />
            Minor edit without version
          </label>
        </div>
      </section>

      <section className="pd-card">
        <div className="pd-section-header">
          <h2>Placeholders</h2>
          <span>{compiled.variables.length} detected</span>
        </div>
        {compiled.variables.length === 0 ? <p className="pd-muted">No placeholders detected.</p> : null}
        {compiled.variables.map((name) => {
          const variable = draft.variables[name] || { name, required: true };
          return (
            <div className="pd-variable-row" key={name}>
              <code>{`{{${name}}}`}</code>
              <select value={variable.inputKind || "text"} onChange={(event) => setVariable(name, { inputKind: event.target.value as PromptVariableDefinition["inputKind"] })}>
                <option value="text">Text</option>
                <option value="textarea">Textarea</option>
                <option value="select">Select</option>
              </select>
              <input value={variable.defaultValue || ""} onChange={(event) => setVariable(name, { defaultValue: event.target.value })} placeholder="Default value" />
            </div>
          );
        })}
      </section>

      <section className="pd-card">
        <div className="pd-section-header">
          <h2>Variants</h2>
          <Button onClick={addVariant}>
            <Plus size={14} /> Add variant
          </Button>
        </div>
        {draft.variants.length === 0 ? <p className="pd-muted">No variants yet.</p> : null}
        {draft.variants.map((variant) => (
          <div className="pd-variant" key={variant.id}>
            <div className="pd-variant-grid">
              <input value={variant.name} onChange={(event) => updateVariant(variant, { name: event.target.value })} />
              <input value={variant.suffix} onChange={(event) => updateVariant(variant, { suffix: event.target.value })} />
              <Button variant="ghost" onClick={() => setDraft(removeVariant(draft, variant.id))}>
                Remove
              </Button>
            </div>
            <textarea value={variant.content} onChange={(event) => updateVariant(variant, { content: event.target.value })} spellCheck={false} />
          </div>
        ))}
      </section>
    </main>
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

  return (
    <aside className="pd-rail">
      <section className="pd-card">
        <h2>
          <History size={15} /> Versions
        </h2>
        <div className="pd-version-list">
          {prompt.versions.map((version) => (
            <article className="pd-version-card" key={version.id}>
              <div>
                <strong>{version.id}</strong>
                {version.id === prompt.defaultVersionId ? <span>default</span> : null}
              </div>
              <input
                value={version.label}
                onChange={(event) =>
                  onDraftChange({
                    ...prompt,
                    versions: prompt.versions.map((item) => (item.id === version.id ? { ...item, label: event.target.value } : item))
                  })
                }
              />
              <p>{version.changelog || "No changelog note."}</p>
              <div className="pd-mini-actions">
                <Button variant="ghost" onClick={() => onDraftChange(setDefaultVersion(prompt, version.id))}>
                  Default
                </Button>
                <Button variant="ghost" onClick={() => onDraftChange(restoreVersionAsLatest(prompt, version.id))}>
                  Restore
                </Button>
                <Button
                  variant="ghost"
                  disabled={!canDeleteVersions}
                  onClick={() => {
                    if (confirm(`Delete version ${version.id}?`)) onDraftChange(deleteVersion(prompt, version.id));
                  }}
                >
                  Delete
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="pd-card">
        <h2>
          <FileDiff size={15} /> Compare
        </h2>
        <div className="pd-compare-controls">
          <select value={leftVersion} onChange={(event) => setLeftVersion(event.target.value)}>
            {prompt.versions.map((version) => (
              <option key={version.id}>{version.id}</option>
            ))}
          </select>
          <select value={rightVersion} onChange={(event) => setRightVersion(event.target.value)}>
            {prompt.versions.map((version) => (
              <option key={version.id}>{version.id}</option>
            ))}
          </select>
        </div>
        <pre className="pd-diff">
          {diff.map((line) => `${line.type === "add" ? "+ " : line.type === "remove" ? "- " : "  "}${line.text}`).join("\n")}
        </pre>
      </section>
    </aside>
  );
}

function App() {
  const [state, setState] = useState<LibraryState>({ prompts: [], settings: defaultSettings, libraryPath: "" });
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");

  const selected = state.prompts.find((prompt) => prompt.id === selectedId) || state.prompts[0];

  const load = async () => {
    const next = await request<LibraryState>("LIBRARY_GET");
    setState(next);
    setSelectedId((current) => (current && next.prompts.some((prompt) => prompt.id === current) ? current : next.prompts[0]?.id || ""));
  };

  useEffect(() => {
    void load().catch((error) => setStatus(error.message));
  }, []);

  const run = async (label: string, action: () => Promise<void>) => {
    setStatus(`${label}...`);
    try {
      await action();
      setStatus(`${label} complete`);
      window.setTimeout(() => setStatus(""), 1800);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "PromptDeck request failed");
    }
  };

  const saveDraftPrompt = async (prompt: Prompt) => {
    setState((current) => ({ ...current, prompts: current.prompts.map((item) => (item.id === prompt.id ? prompt : item)) }));
    setStatus("Save...");
    try {
      const saved = await request<Prompt>("PROMPT_SAVE", {
        prompt,
        content: currentContent(prompt),
        minorEdit: true
      });
      setState((current) => ({ ...current, prompts: current.prompts.map((item) => (item.id === saved.id ? saved : item)) }));
      setStatus("Saved");
      window.setTimeout(() => setStatus(""), 1800);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "PromptDeck request failed");
    }
  };

  return (
    <div className="pd-app">
      <Sidebar
        prompts={state.prompts}
        selected={selected}
        query={query}
        settings={state.settings}
        status={status}
        libraryPath={state.libraryPath}
        onQuery={setQuery}
        onSelect={setSelectedId}
        onCreate={() =>
          void run("Create", async () => {
            const prompt = await request<Prompt>("PROMPT_CREATE");
            await load();
            setSelectedId(prompt.id);
          })
        }
        onSettings={(settings) =>
          void run("Save settings", async () => {
            const nextSettings = await request<PromptDeckSettings>("SETTINGS_SAVE", { settings });
            setState((current) => ({ ...current, settings: nextSettings }));
          })
        }
        onImport={(file, mode) =>
          void run("Import", async () => {
            if (mode === "replace" && !confirm("Replace the central PromptDeck library with this backup?")) return;
            await request("BACKUP_IMPORT", { raw: JSON.parse(await file.text()), mode });
            await load();
          })
        }
        onExport={() =>
          void run("Export", async () => {
            const result = await request<{ filename: string; content: string }>("BACKUP_EXPORT");
            download(result.filename, result.content);
          })
        }
        onOpenLibrary={() => void run("Open library", async () => request("LIBRARY_OPEN_FILE"))}
        logoUri={logoUri}
      />
      {selected ? (
        <>
          <PromptEditor
            key={selected.id}
            prompt={selected}
            status={status}
            onSave={(prompt, content, minorEdit, changelog) =>
              run("Save", async () => {
                const saved = await request<Prompt>("PROMPT_SAVE", { prompt, content, minorEdit, changelog });
                await load();
                setSelectedId(saved.id);
              })
            }
            onDelete={(token) =>
              run("Delete", async () => {
                if (!confirm(`Delete ${token}?`)) return;
                await request("PROMPT_DELETE", { token });
                await load();
              })
            }
            onDuplicate={(token) =>
              run("Duplicate", async () => {
                const prompt = await request<Prompt>("PROMPT_DUPLICATE", { token });
                await load();
                setSelectedId(prompt.id);
              })
            }
            onInsert={(token) => run("Insert", async () => request("PROMPT_INSERT", { token }))}
            onCopy={(token) => run("Copy", async () => request("PROMPT_COPY", { token }))}
          />
          <VersionRail
            prompt={selected}
            onDraftChange={(prompt) => void saveDraftPrompt(prompt)}
          />
        </>
      ) : (
        <main className="pd-empty">
          {logoUri ? <img className="pd-empty-logo" src={logoUri} alt="" aria-hidden="true" /> : null}
          <h2>No prompts yet</h2>
          <Button variant="primary" onClick={() => request<Prompt>("PROMPT_CREATE").then((prompt) => load().then(() => setSelectedId(prompt.id)))}>
            <Plus size={15} /> Create prompt
          </Button>
        </main>
      )}
    </div>
  );
}

createRoot(root!).render(<App />);
