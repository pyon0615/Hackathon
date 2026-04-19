import { BusinessType } from "@/data/businessTypes";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface Step2Props {
  type: BusinessType;
  selected: string | null;
  onSelect: (id: string) => void;
}

export const Step2Subtype = ({ type, selected, onSelect }: Step2Props) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 px-4 py-3 border border-border-strong bg-paper-deep/40">
        <span className="font-display text-3xl text-ink">{type.icon}</span>
        <div>
          <div className="data-tag">Selected category</div>
          <div className="font-display font-semibold text-lg text-ink">{type.label}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {type.subtypes.map((s, i) => {
          const active = selected === s.id;
          return (
            <motion.button
              key={s.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              onClick={() => onSelect(s.id)}
              className={cn(
                "text-left p-4 border-2 bg-card transition-all hover:shadow-paper",
                active
                  ? "border-accent ring-2 ring-accent/30 bg-accent/5"
                  : "border-border hover:border-border-strong"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-display font-semibold text-base text-ink">
                  {s.label}
                </span>
                <span className={cn(
                  "size-4 border-2 flex items-center justify-center transition-colors",
                  active ? "bg-accent border-accent text-accent-foreground" : "border-border-strong"
                )}>
                  {active && <span className="text-[10px]">✓</span>}
                </span>
              </div>
              <div className="data-tag mt-2">{s.tag}</div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};
