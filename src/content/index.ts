import type { Prompt, PromptDeckSettings } from "../shared/models/prompt";
import { sendRuntimeMessage } from "../shared/runtime/sendMessage";
import { searchPrompts, type SearchResult } from "../shared/search/fuzzySearch";
import { SETTINGS_KEY } from "../shared/settings/settingsService";
import { defaultSettings } from "../shared/settings/defaultSettings";
import { PROMPTDECK_STATE_KEY } from "../shared/state/stateInvalidation";
import { resolvePromptContent } from "../shared/versioning/versionService";
import { getCurrentHost, isHostDisabled } from "./adapters/siteAdapter";
import { parseCommandAt, type ParsedCommand } from "./commandDetection/commandParser";
import { InputTextTracker } from "./commandDetection/inputTextTracker";
import { caretRect, getActiveEditable, getEditableSnapshot, type EditableElement } from "./insertion/editable";
import { insertOrCopy } from "./insertion/insertionService";
import { consumePromptDeckKeyboardEvent, isPromptDeckOwnedKey } from "./keyboard/keyboardOwnership";

const PALETTE_CSS = `
:host{all:initial;display:block;width:0;height:0;margin:0;padding:0;border:0;background:transparent;color:initial;font:initial;contain:style}
.pd-root,.pd-root *{box-sizing:border-box}
.pd-root{all:initial;position:fixed;z-index:2147483647;width:max-content;max-width:min(520px,calc(100vw - 24px));font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px;letter-spacing:0;color:#111827}
.pd-pill{display:flex;align-items:center;gap:8px;max-width:min(520px,calc(100vw - 24px));border:1px solid rgba(148,163,184,.55);border-radius:999px;background:#fff;padding:6px 8px;box-shadow:0 12px 36px rgba(15,23,42,.22)}
.pd-pill-main{display:flex;align-items:center;gap:7px;min-width:0;border:0;background:transparent;color:inherit;cursor:pointer;padding:0;text-align:left}.pd-icon{display:grid;place-items:center;width:22px;height:22px;border-radius:999px;background:#eff6ff}.pd-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px;font-weight:600}.pd-hint,.pd-count{white-space:nowrap;color:#64748b;font-size:11px}.pd-gear{display:grid;place-items:center;width:24px;height:24px;border:0;border-radius:999px;background:transparent;color:#64748b;cursor:pointer}.pd-gear:hover,.pd-pill-main:hover{background:rgba(148,163,184,.12)}
.pd-ask{display:flex;align-items:center;gap:6px;white-space:nowrap}.pd-ask button{border:1px solid rgba(148,163,184,.55);border-radius:999px;background:transparent;color:inherit;padding:4px 9px;font:inherit;font-size:11px;font-weight:650;line-height:1;cursor:pointer}.pd-ask button:hover{background:rgba(148,163,184,.14)}
.pd-menu{margin-top:6px;overflow:hidden;border:1px solid rgba(148,163,184,.5);border-radius:10px;background:#fff;box-shadow:0 16px 42px rgba(15,23,42,.2);max-width:min(420px,calc(100vw - 24px))}
.pd-option{display:grid;grid-template-columns:1fr auto;width:100%;gap:4px 12px;border:0;border-bottom:1px solid rgba(148,163,184,.16);background:transparent;color:inherit;padding:9px 10px;text-align:left;cursor:pointer}.pd-option:last-child{border-bottom:0}.pd-option strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pd-option small{color:#64748b}.pd-selected{background:rgba(37,99,235,.1)}
.pd-empty{display:flex;align-items:center;gap:8px;color:#64748b}
@media (prefers-color-scheme:dark){.pd-root{color:#f8fafc}.pd-pill,.pd-menu{background:#0f172a;border-color:rgba(71,85,105,.75)}.pd-icon{background:#1e293b}.pd-hint,.pd-count,.pd-option small{color:#94a3b8}}
@media (prefers-reduced-motion:reduce){.pd-root,.pd-root *{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
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

interface PaletteDom {
  root: HTMLDivElement;
  main: HTMLButtonElement;
  title: HTMLSpanElement;
  hint: HTMLSpanElement;
  ask: HTMLSpanElement;
  count: HTMLSpanElement;
  menu: HTMLDivElement;
  options: HTMLButtonElement[];
}

const MAX_DROPDOWN_OPTIONS = 5;

export class PaletteController {
  private host: HTMLDivElement;
  private shadow: ShadowRoot;
  private dom: PaletteDom;
  private prompts: Prompt[] = [];
  private promptsLoaded = false;
  private refreshPromise: Promise<void> | null = null;
  private settings: PromptDeckSettings = defaultSettings;
  private activeEditable: EditableElement | null = null;
  private opaqueInputTarget: Element | null = null;
  private readonly opaqueInputText = new InputTextTracker();
  private refreshTimer: number | undefined;
  private state: State = { open: false, command: null, results: [], selectedIndex: 0, expanded: false, askPending: false };

  constructor() {
    this.host = document.createElement("div");
    this.host.id = "promptdeck-root";
    this.host.style.all = "initial";
    this.host.style.display = "block";
    this.host.style.width = "0";
    this.host.style.height = "0";
    this.host.style.margin = "0";
    this.host.style.padding = "0";
    this.host.style.border = "0";
    this.host.style.background = "transparent";
    this.host.style.color = "initial";
    this.host.style.font = "initial";
    this.host.style.contain = "style";
    this.shadow = this.host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = PALETTE_CSS;
    this.shadow.append(style);
    this.dom = this.createPaletteDom();
    this.shadow.append(this.dom.root);
    (document.body || document.documentElement).append(this.host);
  }

  start(): void {
    void this.refreshData();
    document.addEventListener("input", this.onInput, true);
    document.addEventListener("keyup", this.onKeyup, true);
    document.addEventListener("keydown", this.onKeydown, true);
    document.addEventListener("focusout", this.onFocusOut, true);
    document.addEventListener("mousedown", this.onMouseDown, true);
    if (typeof chrome !== "undefined") {
      chrome.storage?.onChanged?.addListener?.(this.onStorageChanged);
    }
  }

  stop(): void {
    document.removeEventListener("input", this.onInput, true);
    document.removeEventListener("keyup", this.onKeyup, true);
    document.removeEventListener("keydown", this.onKeydown, true);
    document.removeEventListener("focusout", this.onFocusOut, true);
    document.removeEventListener("mousedown", this.onMouseDown, true);
    if (this.refreshTimer !== undefined) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    if (typeof chrome !== "undefined") {
      chrome.storage?.onChanged?.removeListener?.(this.onStorageChanged);
    }
    this.host.remove();
  }

  private async refreshData(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.loadData();
    await this.refreshPromise;
  }

  private async loadData(): Promise<void> {
    try {
      const [prompts, settings] = await Promise.all([
        sendRuntimeMessage<Prompt[]>({ type: "PROMPTS_LIST" }),
        sendRuntimeMessage<PromptDeckSettings>({ type: "SETTINGS_GET" })
      ]);
      this.prompts = prompts;
      this.promptsLoaded = true;
      this.settings = settings;
      this.refreshOpenState();
    } catch (error) {
      this.settings = defaultSettings;
      const message = error instanceof Error ? error.message : "Could not load PromptDeck.";
      this.setState({ error: message });
    } finally {
      this.refreshPromise = null;
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

  private refreshOpenState(): void {
    if (!this.state.open || !this.state.command) return;
    if (isHostDisabled(getCurrentHost(), this.settings.disabledHosts)) {
      this.dismiss();
      return;
    }

    const results = searchPrompts(this.prompts, this.state.command.query, location.hostname);
    this.setState({
      results,
      selectedIndex: Math.min(this.state.selectedIndex, Math.max(0, results.length - 1)),
      error: undefined
    });
  }

  private onInput = (event: Event): void => {
    if (this.updateFromCaret()) return;
    if (event instanceof InputEvent) this.updateFromOpaqueInput(event);
  };

  private onFocusOut = (): void => {
    window.setTimeout(() => {
      if (!this.state.open) return;
      const active = document.activeElement;
      if (active && this.host.contains(active)) return;
      if (getActiveEditable()) return;
      if (
        this.opaqueInputTarget &&
        (active === this.opaqueInputTarget || (active instanceof Element && active.contains(this.opaqueInputTarget)))
      )
        return;
      this.resetOpaqueInput();
      this.dismiss();
    }, 120);
  };

  private onMouseDown = (event: MouseEvent): void => {
    const target = event.target;
    if (target instanceof Node && this.host.contains(target)) return;
    this.resetOpaqueInput();
    if (this.state.open) this.dismiss();
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
      this.resetOpaqueInput();
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

  private updateFromCaret(): boolean {
    if (isHostDisabled(getCurrentHost(), this.settings.disabledHosts)) return false;
    const editable = getActiveEditable();
    if (!editable) return false;
    const snapshot = getEditableSnapshot(editable);
    if (!snapshot) return false;
    this.resetOpaqueInput();
    const command = parseCommandAt(snapshot.text, snapshot.selectionStart, this.settings.trigger);
    if (!command) {
      if (this.state.open) this.dismiss();
      return true;
    }
    this.activeEditable = editable;
    if (!this.promptsLoaded) void this.refreshData();
    this.openForCommand(command, caretRect(editable));
    return true;
  }

  private updateFromOpaqueInput(event: InputEvent): void {
    if (isHostDisabled(getCurrentHost(), this.settings.disabledHosts)) return;
    const text = this.opaqueInputText.update(event);
    const command = parseCommandAt(text, text.length, this.settings.trigger);
    if (!command) {
      if (this.state.open) this.dismiss();
      return;
    }

    this.activeEditable = null;
    this.opaqueInputTarget = event.target instanceof Element ? event.target : document.activeElement;
    if (!this.promptsLoaded) void this.refreshData();
    const anchor = this.opaqueInputTarget instanceof Element ? this.opaqueInputTarget.getBoundingClientRect() : undefined;
    this.openForCommand(command, anchor);
  }

  private openForCommand(command: ParsedCommand, rect?: DOMRect): void {
    this.setState({
      open: true,
      command,
      results: searchPrompts(this.prompts, command.query, location.hostname),
      selectedIndex: 0,
      rect,
      expanded: false,
      askPending: false,
      message: undefined,
      error: undefined
    });
  }

  private resetOpaqueInput(): void {
    this.opaqueInputTarget = null;
    this.opaqueInputText.reset();
  }

  private nextIndex(direction: 1 | -1): number {
    if (this.state.results.length === 0) return 0;
    return (this.state.selectedIndex + direction + this.state.results.length) % this.state.results.length;
  }

  private select(index: number): void {
    this.setState({ selectedIndex: index });
  }

  private async insertSelected(options: { copy?: boolean; preserveCommand?: boolean; askChoice?: "direct" | "clipboard" } = {}): Promise<void> {
    if (!this.promptsLoaded) await this.refreshData();
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
      this.resetOpaqueInput();
      this.dismiss();
      return;
    }
    this.resetOpaqueInput();
    this.setState({ message: result.message, open: true, askPending: false });
  }

  private dismiss(): void {
    this.activeEditable = null;
    this.setState({ open: false, command: null, results: [], selectedIndex: 0, expanded: false, askPending: false, message: undefined, error: undefined });
  }

  private setState(next: Partial<State>): void {
    this.state = { ...this.state, ...next };
    this.render();
  }

  private createPaletteDom(): PaletteDom {
    const root = document.createElement("div");
    root.className = "pd-root";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "PromptDeck autocomplete");
    root.hidden = true;

    const wrap = document.createElement("div");
    const pill = document.createElement("div");
    pill.className = "pd-pill";

    const main = document.createElement("button");
    main.type = "button";
    main.className = "pd-pill-main";
    main.setAttribute("aria-controls", "promptdeck-results");
    main.setAttribute("aria-expanded", "false");
    main.setAttribute("aria-haspopup", "listbox");
    main.setAttribute("aria-label", "Toggle PromptDeck results");
    main.onmousedown = (event) => event.preventDefault();
    main.onclick = () => this.setState({ expanded: !this.state.expanded });

    const icon = document.createElement("span");
    icon.className = "pd-icon";
    icon.textContent = "✦";

    const title = document.createElement("span");
    title.className = "pd-title";

    main.append(icon, title);

    const hint = document.createElement("span");
    hint.className = "pd-hint";

    const ask = this.createAskControls();

    const count = document.createElement("span");
    count.className = "pd-count";

    const gear = document.createElement("button");
    gear.type = "button";
    gear.className = "pd-gear";
    gear.textContent = "⚙";
    gear.setAttribute("aria-label", "Open PromptDeck settings");
    gear.onmousedown = (event) => event.preventDefault();
    gear.onclick = (event) => {
      event.stopPropagation();
      void sendRuntimeMessage<void>({ type: "OPEN_OPTIONS" });
    };

    pill.append(main, hint, ask, count, gear);
    wrap.append(pill);

    const menu = document.createElement("div");
    menu.id = "promptdeck-results";
    menu.className = "pd-menu";
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", "PromptDeck prompt results");
    const options = Array.from({ length: MAX_DROPDOWN_OPTIONS }, (_, index) => this.createDropdownOption(index));
    menu.append(...options);
    wrap.append(menu);

    root.append(wrap);
    return { root, main, title, hint, ask, count, menu, options };
  }

  private createAskControls(): HTMLSpanElement {
    const controls = document.createElement("span");
    controls.className = "pd-ask";
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "Choose how to use this prompt");

    const insert = document.createElement("button");
    insert.type = "button";
    insert.textContent = "Insert";
    insert.setAttribute("aria-label", "Insert selected prompt");
    insert.onmousedown = (event) => event.preventDefault();
    insert.onclick = (event) => {
      event.stopPropagation();
      void this.insertSelected({ askChoice: "direct" });
    };

    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy";
    copy.setAttribute("aria-label", "Copy selected prompt");
    copy.onmousedown = (event) => event.preventDefault();
    copy.onclick = (event) => {
      event.stopPropagation();
      void this.insertSelected({ askChoice: "clipboard" });
    };

    controls.append(insert, copy);
    return controls;
  }

  private createDropdownOption(index: number): HTMLButtonElement {
    const option = document.createElement("button");
    option.id = `promptdeck-option-${index}`;
    option.type = "button";
    option.className = "pd-option";
    option.setAttribute("role", "option");
    option.onmousedown = (event) => event.preventDefault();
    option.onmouseenter = () => this.select(index);
    option.onclick = () => void this.insertSelected();

    const title = document.createElement("strong");
    const meta = document.createElement("small");
    const command = document.createElement("small");
    option.append(title, meta, command);
    return option;
  }

  private render(): void {
    const { root, main, title, hint, ask, count, menu, options } = this.dom;
    root.hidden = !this.state.open;
    if (!this.state.open) {
      main.setAttribute("aria-expanded", "false");
      menu.removeAttribute("aria-activedescendant");
      return;
    }

    root.style.top = `${Math.max(12, (this.state.rect?.top || 80) - (this.state.expanded ? 250 : 48))}px`;
    root.style.left = `${Math.max(12, Math.min(window.innerWidth - 520, this.state.rect?.left || 20))}px`;

    const selected = this.state.results[this.state.selectedIndex]?.prompt;
    title.textContent = this.state.message || selected?.title || (this.state.command?.raw ? "No matching prompt" : `Type ${this.settings.trigger}`);
    hint.hidden = this.state.askPending || Boolean(this.state.message);
    hint.textContent =
      this.settings.insertionMode === "ask"
        ? "Enter choose"
        : this.settings.insertionMode === "clipboard"
          ? "Enter copy"
          : "Enter insert";
    ask.hidden = !this.state.askPending || Boolean(this.state.message);
    count.textContent =
      this.state.message
        ? ""
        : this.state.results.length > 1
          ? `${this.state.selectedIndex + 1}/${this.state.results.length} Up/Down`
          : this.state.results.length === 1
            ? "1/1"
            : "0/0";

    const showMenu = this.state.expanded && this.state.results.length > 1;
    menu.hidden = !showMenu;
    main.setAttribute("aria-expanded", String(showMenu));
    const visibleResults = this.state.results.slice(0, MAX_DROPDOWN_OPTIONS);
    const activeOption = showMenu ? options[this.state.selectedIndex] : undefined;
    if (activeOption && visibleResults[this.state.selectedIndex]) {
      menu.setAttribute("aria-activedescendant", activeOption.id);
    } else {
      menu.removeAttribute("aria-activedescendant");
    }
    options.forEach((option, index) => {
      const result = visibleResults[index];
      option.hidden = !showMenu || !result;
      option.className = index === this.state.selectedIndex ? "pd-option pd-selected" : "pd-option";
      option.setAttribute("aria-selected", String(Boolean(result) && index === this.state.selectedIndex));
      option.setAttribute("aria-label", result ? `${result.prompt.title}, ${result.prompt.command}, ${result.reason}` : "");
      const [optionTitle, meta, command] = option.children;
      optionTitle.textContent = result?.prompt.title ?? "";
      meta.textContent = result?.reason ?? "";
      command.textContent = result?.prompt.command ?? "";
    });
  }
}

if (!import.meta.env.VITEST) {
  new PaletteController().start();
}
