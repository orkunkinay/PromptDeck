import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "../shared/styles.css";
import type { Prompt, PromptDeckSettings } from "../shared/models/prompt";
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
import { sendRuntimeMessage } from "../shared/runtime/sendMessage";
import { searchPrompts } from "../shared/search/fuzzySearch";
import { defaultSettings } from "../shared/settings/defaultSettings";
import { SETTINGS_KEY } from "../shared/settings/settingsService";
import { createPromptFromCommand } from "../shared/storage/promptRepository";
import { PROMPTDECK_STATE_KEY } from "../shared/state/stateInvalidation";
import { AppShell } from "./AppShell";
import { EmptyState } from "./EmptyState";
import { ImportPreviewModal } from "./ImportPreviewModal";
import { PromptEditor } from "./PromptEditor";
import { Sidebar } from "./Sidebar";
import { VersionRail } from "./VersionRail";
import { download, nextBlankPromptCommand, savePreImportSnapshot } from "./promptUtils";

const OPTIONS_STORAGE_RELOAD_DELAY_MS = 100;

export function App() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [settings, setSettings] = useState<PromptDeckSettings>(defaultSettings);
  const [selectedId, setSelectedId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [pendingImport, setPendingImport] = useState<{ fileName: string; plan: ImportPlan } | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("merge-safe");
  const [replaceConfirmation, setReplaceConfirmation] = useState("");
  const [creatingPrompt, setCreatingPrompt] = useState(false);
  const creatingPromptRef = useRef(false);

  const selected = prompts.find((prompt) => prompt.id === selectedId) || prompts[0];
  const results = useMemo(() => searchPrompts(prompts, query), [prompts, query]);

  const load = useCallback(async () => {
    const [nextPrompts, nextSettings] = await Promise.all([
      sendRuntimeMessage<Prompt[]>({ type: "PROMPTS_LIST" }),
      sendRuntimeMessage<PromptDeckSettings>({ type: "SETTINGS_GET" })
    ]);
    setPrompts(nextPrompts);
    setSettings(nextSettings);
    setSelectedId((current) => (current && nextPrompts.some((prompt) => prompt.id === current) ? current : nextPrompts[0]?.id || ""));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.storage?.onChanged) return;

    let reloadTimer: number | undefined;
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName !== "local") return;
      if (!(PROMPTDECK_STATE_KEY in changes) && !(SETTINGS_KEY in changes)) return;
      if (reloadTimer !== undefined) window.clearTimeout(reloadTimer);
      reloadTimer = window.setTimeout(() => {
        reloadTimer = undefined;
        void load();
      }, OPTIONS_STORAGE_RELOAD_DELAY_MS);
    };

    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      if (reloadTimer !== undefined) window.clearTimeout(reloadTimer);
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, [load]);

  const savePrompt = async (prompt: Prompt, content: string, minorEdit: boolean, changelog: string) => {
    setStatus("Saving...");
    try {
      const saved = await sendRuntimeMessage<Prompt>({ type: "PROMPTS_SAVE", prompt, content, minorEdit, changelog });
      await load();
      setSelectedId(saved.id);
      setStatus("Saved locally");
      window.setTimeout(() => setStatus(""), 1800);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Save failed");
    }
  };

  const createPrompt = async () => {
    if (creatingPromptRef.current) return;

    creatingPromptRef.current = true;
    setCreatingPrompt(true);
    setStatus("Creating...");

    try {
      const latestPrompts = await sendRuntimeMessage<Prompt[]>({ type: "PROMPTS_LIST" });
      const prompt = createPromptFromCommand(nextBlankPromptCommand(latestPrompts));
      const saved = await sendRuntimeMessage<Prompt>({ type: "PROMPTS_SAVE", prompt, minorEdit: true });
      await load();
      setSelectedId(saved.id);
      setQuery("");
      setStatus("Created locally");
      window.setTimeout(() => setStatus(""), 1200);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Create failed");
    } finally {
      creatingPromptRef.current = false;
      setCreatingPrompt(false);
    }
  };

  const deletePrompt = async (id: string) => {
    if (!confirm("Delete this prompt and all versions locally?")) return;
    await sendRuntimeMessage<void>({ type: "PROMPTS_DELETE", id });
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
      await sendRuntimeMessage<void>({ type: "PROMPTS_REPLACE_ALL", prompts: result.prompts });
      await sendRuntimeMessage<PromptDeckSettings>({ type: "SETTINGS_SAVE", settings: result.settings });
      await load();
      setPendingImport(null);
      setStatus(
        importMode === "merge-safe"
          ? "Import complete: " + result.importedPromptCount + " added, " + result.skippedConflictCount + " skipped"
          : "Import complete: " + result.importedPromptCount + " imported"
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Import failed before changes could be saved.");
    }
  };

  const updateSettings = async (patch: Partial<PromptDeckSettings>) => {
    const next = await sendRuntimeMessage<PromptDeckSettings>({ type: "SETTINGS_SAVE", settings: { ...settings, ...patch } });
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
          creatingPrompt={creatingPrompt}
          onSettings={(patch) => void updateSettings(patch)}
          onExportBackup={exportBackup}
          onExportMarkdown={() => selected && download(selected.id + ".md", promptToMarkdown(selected))}
          onImport={(file) => void previewBackupImport(file)}
          onDeleteAll={async () => {
            if (confirm("Delete all PromptDeck data from this browser?")) {
              await sendRuntimeMessage<void>({ type: "PROMPTS_REPLACE_ALL", prompts: [] });
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

if (!import.meta.env.VITEST) {
  createRoot(document.getElementById("root")!).render(<App />);
}
