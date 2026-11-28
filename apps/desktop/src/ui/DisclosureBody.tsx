import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

export function DisclosureBody({ id, open, children }: { id: string; open: boolean; children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  return <div id={id} inert={!open}>
    <AnimatePresence initial={false}>
      {open && <motion.div className="disclosure-body"
        initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.23, 1, 0.32, 1] }}>
        {children}
      </motion.div>}
    </AnimatePresence>
  </div>;
}
