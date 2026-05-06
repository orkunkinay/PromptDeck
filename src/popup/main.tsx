import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ExternalLink, ShieldCheck } from "lucide-react";
import "../shared/styles.css";
import type { Prompt } from "../shared/models/prompt";
import { promptRepository } from "../shared/storage/promptRepository";

function App() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);

  useEffect(() => {
    void promptRepository.list().then((items) => setPrompts(items.slice(0, 6)));
  }, []);

  return (
    <div className="w-80 bg-white p-4 text-slate-950 [color-scheme:light]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="" className="h-9 w-9 rounded-xl object-cover" />
          <div>
            <h1 className="text-lg font-semibold">PromptDeck</h1>
            <p className="text-sm text-slate-500">Type ;; in any textbox.</p>
          </div>
        </div>
        <button className="rounded-md border p-2" onClick={() => chrome.runtime.openOptionsPage()} aria-label="Open manager">
          <ExternalLink size={16} />
        </button>
      </div>
      <div className="mt-4 space-y-2">
        {prompts.map((prompt) => (
          <div className="rounded-md border p-2 text-sm" key={prompt.id}>
            <strong>{prompt.title}</strong>
            <span className="block text-slate-500">{prompt.command}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-900">
        <ShieldCheck size={16} aria-hidden /> Local-first. No prompt telemetry.
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
