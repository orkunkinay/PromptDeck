import type { ImportMode, ImportPlan } from "../shared/backup";
import { Badge, Button, Card, Field, SectionHeader, TextInput, cx } from "./ui";

export function ImportPreviewModal({
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
