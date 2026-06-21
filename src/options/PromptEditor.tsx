import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import type { Prompt, PromptVariant, PromptVariableDefinition } from "../shared/models/prompt";
import { compilePrompt, ensureVariableDefinitions } from "../shared/promptCompiler/compiler";
import { limitPromptTitle, MAX_PROMPT_TITLE_LENGTH, nowIso } from "../shared/utils/id";
import { removeVariant, upsertVariant } from "../shared/versioning/variantService";
import { Badge, Button, Card, Field, SaveState, SectionHeader, Select, TextArea, TextInput } from "./ui";
import { currentContent } from "./promptUtils";

export function PromptEditor({
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
