import { useEffect, useState } from "react";
import { FileDiff, History, RotateCcw, Trash2 } from "lucide-react";
import type { Prompt } from "../shared/models/prompt";
import { deleteVersion, diffLines, restoreVersionAsLatest, setDefaultVersion } from "../shared/versioning/versionService";
import { Badge, Button, Card, Select } from "./ui";

export function VersionRail({ prompt, onDraftChange }: { prompt: Prompt; onDraftChange(prompt: Prompt): void }) {
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
    <div className="space-y-4 p-4 lg:p-5" aria-label="Prompt versions and comparison">
      <Card className="p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <History size={16} className="text-[var(--pd-text-muted)]" />
            <h2 className="text-sm font-semibold text-[var(--pd-text)]">Versions</h2>
          </div>
          <span className="shrink-0 text-xs font-medium text-[var(--pd-text-muted)]">{prompt.versions.length}</span>
        </div>
        <div className="max-h-[380px] space-y-2 overflow-y-auto pr-1" role="list" aria-label="Saved prompt versions">
          {prompt.versions.map((version) => (
            <div className="rounded-xl border border-[var(--pd-border)] bg-[var(--pd-surface-elevated)] p-3" key={version.id} role="listitem">
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
                <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => onDraftChange(setDefaultVersion(prompt, version.id))} aria-label={`Set ${version.id} as default version`}>
                  Default
                </Button>
                <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => onDraftChange(restoreVersionAsLatest(prompt, version.id))} aria-label={`Restore ${version.id} as latest version`}>
                  <RotateCcw size={13} /> Restore
                </Button>
                <Button
                  variant="ghost"
                  className="ml-auto h-8 px-2 text-xs text-[var(--pd-danger)] hover:border-[var(--pd-danger)] hover:text-[var(--pd-danger)]"
                  disabled={!canDeleteVersions}
                  onClick={() => handleDeleteVersion(version.id)}
                  title={canDeleteVersions ? `Delete ${version.id}` : "A prompt must keep at least one version"}
                  aria-label={`Delete ${version.id}`}
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
        <pre className="mt-3 max-h-[360px] overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs leading-5 text-slate-100" role="region" aria-label="Version diff">
          {diff.map((line) => `${line.type === "add" ? "+ " : line.type === "remove" ? "- " : "  "}${line.text}`).join("\n")}
        </pre>
      </Card>
    </div>
  );
}
