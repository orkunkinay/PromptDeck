import React, { useEffect, useState } from "react";
import type { PromptDeckSettings } from "../shared/models/prompt";
import { cx } from "./ui";

export function AppShell({
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
