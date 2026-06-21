import { Plus, Sparkles } from "lucide-react";
import { Button, Card } from "./ui";

export function EmptyState({ onCreate }: { onCreate(): void }) {
  return (
    <main className="grid h-full place-items-center p-8">
      <Card className="max-w-md p-8 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--pd-primary)] text-[var(--pd-primary-foreground)]">
          <Sparkles size={20} />
        </div>
        <h2 className="mt-5 text-xl font-semibold tracking-[-0.02em] text-[var(--pd-text)]">Create your first prompt</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--pd-text-muted)]">Save reusable prompts, trigger them with ;;, and keep everything local to this browser.</p>
        <Button variant="primary" onClick={onCreate} className="mt-5">
          <Plus size={15} /> New prompt
        </Button>
      </Card>
    </main>
  );
}
