import { BUSINESS_TYPES, BusinessCategory } from "@/data/businessTypes";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface Step1Props {
  selected: BusinessCategory | null;
  onSelect: (id: BusinessCategory) => void;
}

export const Step1Category = ({ selected, onSelect }: Step1Props) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {BUSINESS_TYPES.map((type, i) => {
        const active = selected === type.id;
        return (
          <motion.button
            key={type.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            onClick={() => onSelect(type.id)}
            className={cn(
              "group relative text-left p-6 border-2 transition-all bg-card",
              "hover:shadow-elevated hover:-translate-y-0.5",
              active
                ? "border-accent ring-2 ring-accent/30 shadow-[0_10px_30px_hsl(var(--accent)/0.25)]"
                : "border-border hover:border-border-strong"
            )}
          >
            <div className="flex items-start justify-between mb-6">
              <div
                className={cn(
                  "size-12 flex items-center justify-center font-display text-2xl border-2 transition-colors",
                  active
                    ? "bg-accent text-accent-foreground border-accent"
                    : "bg-paper text-ink border-border-strong"
                )}
              >
                {type.icon}
              </div>
              <span className="data-tag">CAT/{String(BUSINESS_TYPES.indexOf(type) + 1).padStart(2, "0")}</span>
            </div>
            <h3 className="font-display text-2xl font-semibold tracking-tight text-ink">
              {type.label}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">{type.blurb}</p>
            <div className="mt-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {type.subtypes.length} subtypes available
            </div>
            {active && (
              <motion.div
                layoutId="cat-active"
                className="absolute -top-px -right-px stamp text-accent-foreground bg-accent border-accent"
              >
                ✓ Selected
              </motion.div>
            )}
          </motion.button>
        );
      })}
    </div>
  );
};
