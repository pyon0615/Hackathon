import { ReactNode } from "react";
import { motion } from "framer-motion";

interface StepShellProps {
  stepNumber: number;
  totalSteps: number;
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export const StepShell = ({
  stepNumber,
  totalSteps,
  eyebrow,
  title,
  description,
  children,
  footer,
}: StepShellProps) => {
  return (
    <motion.div
      key={stepNumber}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="container py-8 md:py-12"
    >
      <div className="max-w-5xl mx-auto">
        <div className="flex items-baseline gap-4 mb-3">
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            STEP {String(stepNumber).padStart(2, "0")} / {String(totalSteps).padStart(2, "0")}
          </span>
          <span className="data-tag">{eyebrow}</span>
        </div>
        <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight text-ink leading-[1.05]">
          {title}
        </h1>
        {description && (
          <p className="mt-4 text-base md:text-lg text-ink-soft max-w-2xl leading-relaxed">
            {description}
          </p>
        )}
        <div className="mt-10 md:mt-12">{children}</div>
        {footer && (
          <div className="mt-12 flex items-center justify-between border-t border-border-strong pt-6">
            {footer}
          </div>
        )}
      </div>
    </motion.div>
  );
};
