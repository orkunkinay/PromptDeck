import type { RuntimeMessage } from "../shared/models/messages";
import type { Prompt, PromptDeckSettings } from "../shared/models/prompt";
import { ensureVariableDefinitions } from "../shared/promptCompiler/compiler";
import { sendRuntimeMessage } from "../shared/runtime/sendMessage";
import { searchPrompts, type SearchResult } from "../shared/search/fuzzySearch";
import { SETTINGS_KEY } from "../shared/settings/settingsService";
import { defaultSettings } from "../shared/settings/defaultSettings";
import { PROMPTDECK_STATE_KEY } from "../shared/state/stateInvalidation";
import { nowIso, titleFromCommand } from "../shared/utils/id";
import { resolvePromptContent } from "../shared/versioning/versionService";
import { genericSiteAdapter } from "./adapters/siteAdapter";
import { parseCommandAt, type ParsedCommand } from "./commandDetection/commandParser";
import { caretRect, getActiveEditable, getEditableSnapshot, type EditableElement } from "./insertion/editable";
import { insertOrCopy } from "./insertion/insertionService";
import { consumePromptDeckKeyboardEvent, isPromptDeckOwnedKey } from "./keyboard/keyboardOwnership";

const PALETTE_CSS = `
.pd-root{position:fixed;z-index:999999;width:max-content;max-width:min(520px,calc(100vw - 24px));font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px;letter-spacing:0;color:#111827}
.pd-pill{display:flex;align-items:center;gap:8px;max-width:min(520px,calc(100vw - 24px));border:1px solid rgba(148,163,184,.55);border-radius:999px;background:#fff;padding:6px 8px;box-shadow:0 12px 36px rgba(15,23,42,.22)}
.pd-pill-main{display:flex;align-items:center;gap:7px;min-width:0;border:0;background:transparent;color:inherit;cursor:pointer;padding:0;text-align:left}.pd-icon{display:grid;place-items:center;width:22px;height:22px;border-radius:999px;background:#eff6ff}.pd-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px;font-weight:600}.pd-hint,.pd-count{white-space:nowrap;color:#64748b;font-size:11px}.pd-gear{display:grid;place-items:center;width:24px;height:24px;border:0;border-radius:999px;background:transparent;color:#64748b;cursor:pointer}.pd-gear:hover,.pd-pill-main:hover{background:rgba(148,163,184,.12)}
.pd-ask{display:flex;align-items:center;gap:6px;white-space:nowrap}.pd-ask button{border:1px solid rgba(148,163,184,.55);border-radius:999px;background:transparent;color:inherit;padding:4px 9px;font:inherit;font-size:11px;font-weight:650;line-height:1;cursor:pointer}.pd-ask button:hover{background:rgba(148,163,184,.14)}
.pd-menu{margin-top:6px;overflow:hidden;border:1px solid rgba(148,163,184,.5);border-radius:10px;background:#fff;box-shadow:0 16px 42px rgba(15,23,42,.2);max-width:min(420px,calc(100vw - 24px))}
.pd-option{display:grid;grid-template-columns:1fr auto;width:100%;gap:4px 12px;border:0;border-bottom:1px solid rgba(148,163,184,.16);background:transparent;color:inherit;padding:9px 10px;text-align:left;cursor:pointer}.pd-option:last-child{border-bottom:0}.pd-option strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pd-option small{color:#64748b}.pd-selected{background:rgba(37,99,235,.1)}
.pd-empty{display:flex;align-items:center;gap:8px;color:#64748b}
@media (prefers-color-scheme:dark){.pd-root{color:#f8fafc}.pd-pill,.pd-menu{background:#0f172a;border-color:rgba(71,85,105,.75)}.pd-icon{background:#1e293b}.pd-hint,.pd-count,.pd-option small{color:#94a3b8}}
`;

interface State {
  open: boolean;
  command: ParsedCommand | null;
  results: SearchResult[];
  selectedIndex: number;
  rect?: DOMRect;
  message?: string;
  error?: string;
  expanded: boolean;
  askPending: boolean;
}

function text(value: string): Text {
  return document.createTextNode(value);
}

function createPromptFromCommandLocal(command: string, content: string, title?: string): Prompt {
  const now = nowIso();
  const normalizedCommand = command.startsWith("/") ? command : `/${command}`;
  const id = normalizedCommand.replace(/^\//, "").toLowerCase();
  return {
    id,
    title: title?.trim() || titleFromCommand(normalizedCommand),
    command: normalizedCommand,
    aliases: [],
    tags: [],
    description: "",
    body: content,
    defaultVersionId: "v1",
    versions: [{ id: "v1", promptId: id, label: "Original", content, changelog: "Created prompt", createdAt: now, createdBy: "local user", isDefault: true }],
    variants: [],
    variables: ensureVariableDefinitions(content),
    createdAt: now,
    updatedAt: now,
    usageCount: 0
  };
}

class PaletteController {
  private host: HTMLDivElement;
  private prompts: Prompt[] = [];
  private settings: PromptDeckSettings = defaultSettings;
  private activeEditable: EditableElement | null = null;
  private refreshTimer: number | undefined;
  private state: State = { open: false, command: null, results: [], selectedIndex: 0, expanded: false, askPending: false };

  constructor() {
    this.host = document.createElement("div");
    this.host.id = "promptdeck-root";
    const style = document.createElement("style");
    style.textContent = PALETTE_CSS;
    this.host.append(style);
    (document.body || document.documentElement).append(this.host);
  }

  start(): void {
    void this.refreshData();
    document.addEventListener("input", this.onInput, true);
    document.addEventListener("keyup", this.onKeyup, true);
    document.addEventListener("keydown", this.onKeydown, true);
    document.addEventListener("focusin", () => void this.refreshData(), true);
    document.addEventListener("focusout", this.onFocusOut, true);
    document.addEventListener("mousedown", this.onMouseDown, true);
    if (typeof chrome !== "undefined") {
      chrome.storage?.onChanged?.addListener?.(this.onStorageChanged);
      chrome.runtime?.onMessage?.addListener?.(this.onRuntimeMessage);
    }
  }

  private async refreshData(): Promise<void> {
    try {
      const [prompts, settings] = await Promise.all([
        sendRuntimeMessage<Prompt[]>({ type: "PROMPTS_LIST" }),
        sendRuntimeMessage<PromptDeckSettings>({ type: "SETTINGS_GET" })
      ]);
      this.prompts = prompts;
      this.settings = settings;
      this.refreshOpenState();
    } catch (error) {
      this.settings = defaultSettings;
      const message = error instanceof Error ? error.message : "Could not load PromptDeck.";
      this.setState({ error: message });
    }
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer !== undefined) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = undefined;
      void this.refreshData();
    }, 100);
  }

  private onStorageChanged = (changes: Record<string, chrome.storage.StorageChange>, areaName: string): void => {
    if (areaName !== "local") return;
    if (SETTINGS_KEY in changes || PROMPTDECK_STATE_KEY in changes) {
      this.scheduleRefresh();
    }
  };

  private onRuntimeMessage = (message: RuntimeMessage): void => {
    if (message.type === "PROMPTDECK_STATE_CHANGED") this.scheduleRefresh();
  };

  private refreshOpenState(): void {
    if (!this.state.open || !this.state.command) return;
    if (genericSiteAdapter.isDisabled(genericSiteAdapter.getHost(), this.settings.disabledHosts)) {
      this.dismiss();
      return;
    }

    const results = searchPrompts(this.prompts, this.state.command.query, location.hostname);
    this.setState({
      results,
      selectedIndex: Math.min(this.state.selectedIndex, Math.max(0, results.length - 1)),
      message: undefined,
      error: undefined
    });
  }

  private onInput = (): void => this.updateFromCaret();

  private onFocusOut = (): void => {
    window.setTimeout(() => {
      if (!this.state.open) return;
      const active = document.activeElement;
      if (active && this.host.contains(active)) return;
      if (getActiveEditable()) return;
      this.dismiss();
    }, 120);
  };

  private onMouseDown = (event: MouseEvent): void => {
    if (!this.state.open) return;
    const target = event.target;
    if (target instanceof Node && this.host.contains(target)) return;
    this.dismiss();
  };

  private onKeyup = (event: KeyboardEvent): void => {
    if (!["ArrowUp", "ArrowDown", "Enter", "Escape", "Tab"].includes(event.key)) this.updateFromCaret();
  };

  private onKeydown = (event: KeyboardEvent): void => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      void sendRuntimeMessage<void>({ type: "OPEN_OPTIONS" });
      return;
    }
    if (!this.state.open) return;
    if (event.isComposing) return;
    if (event.key === "Escape") {
      consumePromptDeckKeyboardEvent(event);
      this.dismiss();
    } else if ((event.metaKey || event.ctrlKey) && event.key === "ArrowDown") {
      consumePromptDeckKeyboardEvent(event);
      this.setState({ expanded: true });
    } else if (event.key === "ArrowDown") {
      consumePromptDeckKeyboardEvent(event);
      this.select(this.nextIndex(1));
    } else if (event.key === "ArrowUp") {
      consumePromptDeckKeyboardEvent(event);
      this.select(this.nextIndex(-1));
    } else if (event.key === "Tab") {
      consumePromptDeckKeyboardEvent(event);
      void this.insertSelected();
    } else if (event.key === "Enter") {
      consumePromptDeckKeyboardEvent(event);
      void this.insertSelected({ copy: event.metaKey || event.ctrlKey, preserveCommand: event.shiftKey });
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "e") {
      consumePromptDeckKeyboardEvent(event);
      void sendRuntimeMessage<void>({ type: "OPEN_OPTIONS" });
    } else if (isPromptDeckOwnedKey(event)) {
      consumePromptDeckKeyboardEvent(event);
    }
  };

  private updateFromCaret(): void {
    if (genericSiteAdapter.isDisabled(genericSiteAdapter.getHost(), this.settings.disabledHosts)) return;
    const editable = getActiveEditable();
    if (!editable || !genericSiteAdapter.canRun()) return;
    const snapshot = getEditableSnapshot(editable);
    if (!snapshot) return;
    const command = parseCommandAt(snapshot.text, snapshot.selectionStart, this.settings.trigger);
    if (!command) {
      if (this.state.open) this.dismiss();
      return;
    }
    this.activeEditable = editable;
    this.setState({
      open: true,
      command,
      results: searchPrompts(this.prompts, command.query, location.hostname),
      selectedIndex: 0,
      rect: caretRect(editable),
      expanded: false,
      askPending: false,
      message: undefined,
      error: undefined
    });
  }

  private nextIndex(direction: 1 | -1): number {
    if (this.state.results.length === 0) return 0;
    return (this.state.selectedIndex + direction + this.state.results.length) % this.state.results.length;
  }

  private select(index: number): void {
    this.setState({ selectedIndex: index });
  }

  private async insertSelected(options: { copy?: boolean; preserveCommand?: boolean; askChoice?: "direct" | "clipboard" } = {}): Promise<void> {
    const selected = this.state.results[this.state.selectedIndex]?.prompt;
    if (!selected || !this.state.command) return;
    const askChoice = this.settings.insertionMode === "ask" && this.state.askPending && !options.copy && !options.askChoice ? "direct" : options.askChoice;
    if (this.settings.insertionMode === "ask" && !options.copy && !askChoice) {
      this.setState({ askPending: true, expanded: false, message: undefined, error: undefined });
      return;
    }
    const resolved = resolvePromptContent(selected, this.state.command.suffix);
    const explicitClipboard = options.copy || askChoice === "clipboard" || this.settings.insertionMode === "clipboard";
    const result = await insertOrCopy(
      {
        text: resolved.content,
        replaceRange: { start: this.state.command.start, end: this.state.command.end },
        preserveCommand: options.preserveCommand,
        target: this.activeEditable ?? undefined
      },
      explicitClipboard
    );
    await sendRuntimeMessage<void>({ type: "PROMPTS_RECORD_USAGE", id: selected.id, host: location.hostname });
    if (result.mode === "direct" || explicitClipboard) {
      this.dismiss();
      return;
    }
    this.setState({ message: result.message, open: true, askPending: false });
  }

  private async createPrompt(command: string, title: string, content: string): Promise<void> {
    const prompt = createPromptFromCommandLocal(command, content, title);
    const saved = await sendRuntimeMessage<Prompt>({ type: "PROMPTS_SAVE", prompt } satisfies RuntimeMessage);
    this.prompts = [saved, ...this.prompts];
    this.setState({ results: searchPrompts(this.prompts, command), selectedIndex: 0, message: "Prompt created" });
  }

  private dismiss(): void {
    this.activeEditable = null;
    this.setState({ open: false, command: null, results: [], selectedIndex: 0, expanded: false, askPending: false, message: undefined, error: undefined });
  }

  private setState(next: Partial<State>): void {
    this.state = { ...this.state, ...next };
    this.render();
  }

  private render(): void {
    this.host.querySelector(".pd-root")?.remove();
    if (!this.state.open) return;
    const root = document.createElement("div");
    root.className = "pd-root";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "PromptDeck autocomplete");
    root.style.top = `${Math.max(12, (this.state.rect?.top || 80) - (this.state.expanded ? 250 : 48))}px`;
    root.style.left = `${Math.max(12, Math.min(window.innerWidth - 520, this.state.rect?.left || 20))}px`;
    root.append(this.renderAutocomplete());
    this.host.append(root);
  }

  private renderAutocomplete(): HTMLElement {
    const wrap = document.createElement("div");
    const pill = document.createElement("div");
    pill.className = "pd-pill";

    const selected = this.state.results[this.state.selectedIndex]?.prompt;
    const main = document.createElement("button");
    main.type = "button";
    main.className = "pd-pill-main";
    main.onclick = () => this.setState({ expanded: !this.state.expanded });

    const icon = document.createElement("span");
    icon.className = "pd-icon";
    icon.textContent = "✦";

    const title = document.createElement("span");
    title.className = "pd-title";
    title.textContent = selected?.title || (this.state.command?.raw ? "No matching prompt" : `Type ${this.settings.trigger}`);

    main.append(icon, title);

    const insertHint = this.state.askPending ? this.renderAskControls() : document.createElement("span");
    if (!this.state.askPending) {
      insertHint.className = "pd-hint";
      insertHint.textContent =
        this.settings.insertionMode === "ask"
          ? "Enter choose"
          : this.settings.insertionMode === "clipboard"
            ? "Enter copy"
            : "Enter insert";
    }

    const count = document.createElement("span");
    count.className = "pd-count";
    count.textContent =
      this.state.results.length > 1
        ? `${this.state.selectedIndex + 1}/${this.state.results.length} Up/Down`
        : this.state.results.length === 1
          ? "1/1"
          : "0/0";

    const gear = document.createElement("button");
    gear.type = "button";
    gear.className = "pd-gear";
    gear.textContent = "⚙";
    gear.setAttribute("aria-label", "Open PromptDeck settings");
    gear.onclick = (event) => {
      event.stopPropagation();
      void sendRuntimeMessage<void>({ type: "OPEN_OPTIONS" });
    };

    pill.append(main, insertHint, count, gear);
    wrap.append(pill);

    if (this.state.expanded && this.state.results.length > 1) {
      wrap.append(this.renderDropdown());
    }

    return wrap;
  }

  private renderAskControls(): HTMLElement {
    const controls = document.createElement("span");
    controls.className = "pd-ask";

    const insert = document.createElement("button");
    insert.type = "button";
    insert.textContent = "Insert";
    insert.onmousedown = (event) => event.preventDefault();
    insert.onclick = (event) => {
      event.stopPropagation();
      void this.insertSelected({ askChoice: "direct" });
    };

    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy";
    copy.onmousedown = (event) => event.preventDefault();
    copy.onclick = (event) => {
      event.stopPropagation();
      void this.insertSelected({ askChoice: "clipboard" });
    };

    controls.append(insert, copy);
    return controls;
  }

  private renderDropdown(): HTMLElement {
    const menu = document.createElement("div");
    menu.className = "pd-menu";
    menu.setAttribute("role", "listbox");
    this.state.results.slice(0, 5).forEach((result, index) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = index === this.state.selectedIndex ? "pd-option pd-selected" : "pd-option";
      option.onmouseenter = () => this.select(index);
      option.onclick = () => void this.insertSelected();

      const title = document.createElement("strong");
      title.textContent = result.prompt.title;
      const meta = document.createElement("small");
      meta.textContent = result.reason;
      const command = document.createElement("small");
      command.textContent = result.prompt.command;
      option.append(title, meta, command);
      menu.append(option);
    });
    return menu;
  }

  private renderCreate(): HTMLElement {
    const box = document.createElement("div");
    box.className = "pd-empty";
    const title = document.createElement("input");
    title.value = titleFromCommand(this.state.command!.command);
    const content = document.createElement("textarea");
    content.placeholder = "Prompt content";
    const button = document.createElement("button");
    button.className = "pd-btn";
    button.type = "button";
    button.textContent = `Create new prompt ${this.state.command!.command}`;
    button.onclick = () => void this.createPrompt(this.state.command!.command, title.value, content.value);
    box.append(title, content, button);
    return box;
  }

}

new PaletteController().start();
