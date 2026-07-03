/**
 * Motion system — "Paper & Ember"
 * ---------------------------------------------------------------------------
 * One source of truth for every transition in the app. Physical, quiet,
 * interruptible: motion explains state changes and rewards completion, and is
 * otherwise invisible until touched.
 *
 * Rules (see design handoff MOTION.md):
 * - Only `transform` and `opacity` ever animate. No blur transitions, no
 *   box-shadow interpolation (hover shadows cross-fade a pre-rendered layer).
 * - Enter 240ms EASE_OUT rise 8px, stagger 30ms (cap ~8 items).
 * - Move/close 200ms EASE_IN_OUT; presses 120ms scale 0.985 on a spring.
 *
 * Usage:
 *   <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" />
 *   <motion.div {...modalPanel} />            // spread the ready-made props
 *   <motion.button {...pressable} />          // weighted hover / tap spring
 */
import type { Variants, Transition } from "framer-motion";

type Bezier = [number, number, number, number];

/* ---------- Easing curves ---------- */
/** easeOutExpo — immediate response, graceful settle. The signature entrance curve. */
export const EASE_OUT: Bezier = [0.16, 1, 0.3, 1];
/** easeOutQuint — a touch gentler than EASE_OUT, for large hero moves. */
export const EASE_OUT_SOFT: Bezier = [0.22, 1, 0.36, 1];
/** easeInExpo — exits accelerate cleanly away. */
export const EASE_IN: Bezier = [0.7, 0, 0.84, 0];
/** easeInOutCubic — symmetric flow for things that open and close (accordions, layout). */
export const EASE_IN_OUT: Bezier = [0.65, 0, 0.35, 1];

/* ---------- Durations (seconds) ---------- */
export const DUR = {
  fast: 0.12,
  base: 0.24,
  gentle: 0.32,
  /** Legacy alias — a few call sites still reference DUR.slow. */
  slow: 0.32,
} as const;

/* ---------- Springs (weighted, for tactile interactions) ---------- */
/** Hover lifts, layout moves. */
export const springSoft: Transition = { type: "spring", stiffness: 300, damping: 28, mass: 0.9 };
/** Presses, chevrons, toggles, check pops. */
export const springTactile: Transition = { type: "spring", stiffness: 380, damping: 26, mass: 0.6 };
export const springToast: Transition = { type: "spring", stiffness: 260, damping: 24, mass: 0.8 };

/* ============================================================
   Page / tab transitions — NO blur, NO long glide.
   Use with AnimatePresence mode="wait" so tabs never overlap.
   ============================================================ */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.24, ease: EASE_OUT, staggerChildren: 0.03, delayChildren: 0.06 },
  },
  exit: { opacity: 0, y: -4, transition: { duration: 0.12, ease: "easeIn" } },
};

/** A single block that rises into place. Inherits its parent's animate state (cascades via stagger). */
export const riseChild: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.24, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

/** A container that staggers its children. Drive it independently (initial/animate) so it always fires. */
export const staggerContainer: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.03, delayChildren: 0.06 } },
  exit: {},
};

/** Slightly larger entrance for hero / list items that want more presence. */
export const fadeRise: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: DUR.gentle, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: DUR.fast, ease: "easeIn" } },
};

/* ============================================================
   Modals — overlay fade + panel that settles on a spring.
   Backdrop blur is a STATIC style, never animated.
   ============================================================ */
export const overlayMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.18 },
};

export const modalPanel = {
  initial: { opacity: 0, y: 12, scale: 0.985 },
  animate: { opacity: 1, y: 0, scale: 1, transition: springSoft },
  exit: { opacity: 0, y: 8, scale: 0.99, transition: { duration: 0.16, ease: "easeIn" as const } },
};

/* ============================================================
   Accordions — height eases open, content fades in just behind it.
   (framer `height:"auto"` is fine for these small panels)
   ============================================================ */
export const accordion: Variants = {
  initial: { height: 0, opacity: 0 },
  animate: {
    height: "auto",
    opacity: 1,
    transition: {
      height: { duration: 0.24, ease: EASE_IN_OUT },
      opacity: { duration: 0.18, delay: 0.04 },
    },
  },
  exit: {
    height: 0,
    opacity: 0,
    transition: {
      height: { duration: 0.2, ease: EASE_IN_OUT },
      opacity: { duration: 0.1 },
    },
  },
};

/* ============================================================
   Tactile micro-interactions
   ============================================================ */
/** Buttons: quiet lift + press. Spread onto a motion element. Interruptible mid-press. */
export const pressable = {
  whileHover: { y: -1 },
  whileTap: { scale: 0.985 },
  transition: springTactile,
};

/** Cards: −1px lift on hover (shadow deepens via the CSS cross-fade layer). */
export const hoverLift = {
  whileHover: { y: -1 },
  whileTap: { scale: 0.985 },
  transition: springSoft,
};

/* ============================================================
   Toasts — settle on a soft spring, quick fade out
   ============================================================ */
export const toastMotion = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, transition: { duration: 0.16 } },
  transition: springToast,
};
