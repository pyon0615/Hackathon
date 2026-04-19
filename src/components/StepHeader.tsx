import { cn } from "@/lib/utils";

interface Step {
  id: number;
  label: string;
}

interface StepHeaderProps {
  steps: Step[];
  current: number;
}

export const StepHeader = ({ steps, current }: StepHeaderProps) => {
  return (
    <div className="border-b border-border-strong bg-paper">
      <div className="container py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="size-8 bg-ink text-background flex items-center justify-center font-display font-bold text-lg">
              ◎
            </div>
            <div>
              <div className="font-display font-bold text-base leading-none tracking-tight">
                LOCWISE
              </div>
              <div className="data-tag mt-0.5">LOCATION INTELLIGENCE</div>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2">
            {steps.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2">
                <div
                  className={cn(
                    "flex items-center gap-2 px-2.5 py-1 border transition-colors",
                    s.id === current
                      ? "border-ink bg-ink text-background"
                      : s.id < current
                      ? "border-border-strong text-ink"
                      : "border-border text-muted-foreground"
                  )}
                >
                  <span className="font-mono text-[10px] tabular-nums">
                    {String(s.id).padStart(2, "0")}
                  </span>
                  <span className="text-xs font-medium">{s.label}</span>
                </div>
                {i < steps.length - 1 && (
                  <div className="w-3 h-px bg-border-strong" />
                )}
              </div>
            ))}
          </div>
          <div className="md:hidden font-mono text-xs">
            <span className="text-ink font-bold">{String(current).padStart(2, "0")}</span>
            <span className="text-muted-foreground"> / {String(steps.length).padStart(2, "0")}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
