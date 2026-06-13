/**
 * Motion system — "Vanquish"
 * ---------------------------------------------------------------------------
 * One source of truth for every transition in the app. Cinematic & flowing:
 * elements glide in with a gentle rack-focus blur, settle on a strong
 * deceleration curve, and exit by accelerating cleanly out of frame. Nothing
 * snaps; nothing overlaps. Consistency across every surface is what reads as
 * "engineered" rather than "boilerplate".
 *
 * Usage:
 *   <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" />
 *   <motion.div {...modalPanel} />            // spread the ready-made props
 *   <motion.button {...pressable} />          // weighted hover / tap spring
 */
import type { Variants, Transition } from "framer-motion";

type Bezier = [number, number, number, number];

/* ---------- Easing curves ---------- */
/** easeOutExpo — immediate response, long graceful glide to rest. The signature entrance curve. */
export const EASE_OUT: Bezier = [0.16, 1, 0.3, 1];
/** easeOutQuint — a touch gentler than EASE_OUT, for large hero moves. */
export const EASE_OUT_SOFT: Bezier = [0.22, 1, 0.36, 1];
/** easeInExpo — exits accelerate cleanly away. */
export const EASE_IN: Bezier = [0.7, 0, 0.84, 0];
/** easeInOutCubic — symmetric flow for things that open and close (accordions, layout). */
export const EASE_IN_OUT: Bezier = [0.65, 0, 0.35, 1];

/* ---------- Durations (seconds) ---------- */
export const DUR = {
  fast: 0.34,
  base: 0.58,
  slow: 0.82,
} as const;

/* ---------- Springs (weighted, for tactile interactions) ---------- */
export const springSoft: Transition = { type: "spring", stiffness: 230, damping: 26, mass: 0.9 };
export const springTactile: Transition = { type: "spring", stiffness: 320, damping: 22, mass: 0.7 };
export const springToast: Transition = { type: "spring", stiffness: 260, damping: 24, mass: 0.8 };

/* ============================================================
   Page / tab transitions
   Blur clears + content rises, then immediate children cascade.
   Use with AnimatePresence mode="wait" so tabs never overlap.
   ============================================================ */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 26, filter: "blur(10px)" },
  animate: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      duration: DUR.base,
      ease: EASE_OUT,
      staggerChildren: 0.09,
      delayChildren: 0.08,
    },
  },
  exit: {
    opacity: 0,
    y: -16,
    filter: "blur(8px)",
    transition: { duration: DUR.fast, ease: EASE_IN },
  },
};

/** A single block that rises into place. Inherits its parent's animate state (cascades via stagger). */
export const riseChild: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: DUR.base, ease: EASE_OUT } },
  exit: { opacity: 0, y: 10, transition: { duration: 0.24, ease: EASE_IN } },
};

/** A container that staggers its children. Drive it independently (initial/animate) so it always fires. */
export const staggerContainer: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.07, delayChildren: 0.08 } },
  exit: {},
};

/** Slightly larger entrance for hero / list items that want more presence. */
export const fadeRise: Variants = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0, transition: { duration: DUR.slow, ease: EASE_OUT } },
  exit: { opacity: 0, y: 12, transition: { duration: DUR.fast, ease: EASE_IN } },
};

/* ============================================================
   Modals — overlay fade + panel that lifts and racks into focus
   ============================================================ */
export const overlayMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.42, ease: EASE_OUT },
};

export const modalPanel = {
  initial: { opacity: 0, scale: 0.96, y: 24, filter: "blur(14px)" },
  animate: { opacity: 1, scale: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, scale: 0.97, y: 14, filter: "blur(10px)" },
  transition: { duration: DUR.base, ease: EASE_OUT },
};

/* ============================================================
   Accordions — height eases open, content fades in just behind it
   ============================================================ */
export const accordion: Variants = {
  initial: { height: 0, opacity: 0 },
  animate: {
    height: "auto",
    opacity: 1,
    transition: {
      height: { duration: 0.5, ease: EASE_OUT },
      opacity: { duration: 0.4, ease: EASE_OUT, delay: 0.06 },
    },
  },
  exit: {
    height: 0,
    opacity: 0,
    transition: {
      height: { duration: 0.38, ease: EASE_IN_OUT },
      opacity: { duration: 0.18, ease: EASE_IN },
    },
  },
};

/* ============================================================
   Tactile micro-interactions
   ============================================================ */
/** Buttons: gentle weighted swell + press. Spread onto a motion element. */
export const pressable = {
  whileHover: { scale: 1.02 },
  whileTap: { scale: 0.97 },
  transition: springSoft,
};

/** Cards: a graceful lift on hover. Spread onto a motion element. */
export const hoverLift = {
  whileHover: { y: -4 },
  whileTap: { scale: 0.995 },
  transition: springSoft,
};

/* ============================================================
   Toasts — slide in from the right and settle on a soft spring
   ============================================================ */
export const toastMotion = {
  initial: { opacity: 0, x: 44, scale: 0.96 },
  animate: { opacity: 1, x: 0, scale: 1 },
  exit: { opacity: 0, x: 28, scale: 0.96 },
  transition: springToast,
};
