"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, animate, useReducedMotion } from "framer-motion";
import { staggerContainer, riseChild, EASE_OUT, DUR } from "@/lib/motion";
import {
  FireIcon,
  CheckCircleIcon,
  ClockIcon,
  ArrowTrendingUpIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { Tip } from "./Tooltip";
import { fmtPercent } from "@/lib/format";

/**
 * Statistik tab. All day-based aggregation (streak, heatmap, forecast) is done
 * HERE in the browser's local timezone — the server is UTC and grouping there
 * would shift days around local midnight.
 *
 * Data sources:
 * - /api/stats     → review logs (last 365d) + all-time totals
 * - rawItems prop  → due forecast + level distribution (already in memory)
 */

interface StatsLog {
  completedAt: string;
  passed: boolean;
  level: number;
  subjectMain: string;
  subjectSub: string;
  itemId: string | null;
}

interface StatsResponse {
  logs: StatsLog[];
  totals: { total: number; passed: number };
}

export interface StatsItemSlim {
  id: string;
  nextReviewDate: string | Date;
  currentLevel: number;
  subjectMain: string;
  subjectSub: string;
  semester: number;
}

const LEVEL_LABELS = ["T1", "T3", "T7", "T21", "T60", "T180", "T365"] as const;

/**
 * Session cache (PP-4/EM-11): StatsPanel unmounts on every tab switch, so the
 * last response is kept at module level and rendered instantly on remount
 * (stale-while-revalidate). The entrance choreography (skeleton, count-up,
 * heatmap stagger) plays only on the session's first reveal.
 */
let statsCache: StatsResponse | null = null;
let statsRevealed = false;

/** Local-timezone day key (YYYY-MM-DD). */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * Counts up from 0 to `value` on mount — the numbers "arrive" with the page
 * instead of being suddenly there. Falls back to the static value when the
 * user prefers reduced motion.
 */
function AnimatedNumber({ value, appear }: { value: number; appear: boolean }) {
  const reduceMotion = useReducedMotion();
  // On revisits (appear=false) the number starts at its real value — the
  // count-up-from-zero plays only on the session's first reveal (PP-4/EM-11).
  // Mid-session value changes (semester filter, completed reviews) still animate.
  const [display, setDisplay] = useState(appear ? 0 : value);

  useEffect(() => {
    // Reduced motion: skip the count-up but STILL reflect value changes — this
    // number is derived from live dashboard state (e.g. "Heute fällig"), so it
    // must update as reviews are completed, not freeze at the mount value.
    if (reduceMotion) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reflect the new value without animating
      setDisplay(value);
      return;
    }
    // Animate from the CURRENT display toward the new value (not always from 0),
    // so an update mid-session doesn't visibly reset to zero.
    const controls = animate(display, value, {
      duration: 1.1,
      ease: EASE_OUT,
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
    // `display` intentionally omitted: including it would restart the animation
    // on every frame. We only want to (re)animate when the target value changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduceMotion]);

  // With reduced motion the live value is rendered directly — no count-up, and
  // no stale frozen state when the semester filter changes the value in place
  // (the old `useState(value)` snapshot never updated after mount).
  return <>{reduceMotion ? value : display}</>;
}

export default function StatsPanel({ items, language }: { items: StatsItemSlim[]; language: string }) {
  const de = language === "german";
  const locale = de ? "de-DE" : "en-GB"; // app-wide date locales (see DashboardClient)

  const [data, setData] = useState<StatsResponse | null>(statsCache);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(statsCache === null);
  /** Bumped by the error state's retry button — re-runs the fetch effect (EM-6). */
  const [reloadKey, setReloadKey] = useState(0);
  /** Semester filter — "all" (default) or a semester number present in `items`. */
  const [semesterFilter, setSemesterFilter] = useState<number | "all">("all");
  /** IA-10: the module chart truncates to 8 — this expands it in place. */
  const [showAllModules, setShowAllModules] = useState(false);

  // Entrance choreography plays only on the session's first reveal (PP-4/EM-11).
  // Captured once per mount (useState initializer, never set again).
  const [appear] = useState(!statsRevealed);
  // True once the first data commit has painted. Module-bar rows that mount
  // LATER (expander, semester filter) must skip the scaleX entrance: children
  // added to an already-settled variant tree never play their mount animation
  // (framer quirk) and would sit invisible at scaleX(0).
  const [entranceDone, setEntranceDone] = useState(!appear);
  useEffect(() => {
    if (loading || error) return;
    statsRevealed = true;
    if (entranceDone) return;
    // Async flip (post-paint): rows of the first data commit keep their
    // entrance; anything mounted afterwards renders settled.
    const t = window.setTimeout(() => setEntranceDone(true), 0);
    return () => window.clearTimeout(t);
  }, [loading, error, entranceDone]);

  useEffect(() => {
    let cancelled = false;
    // With a cached response already on screen this is a silent background
    // revalidation; `loading` is only true on a cold start or a retry, where
    // the skeleton shows.
    fetch("/api/stats")
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.json();
      })
      .then((json: StatsResponse) => {
        if (cancelled) return;
        statsCache = json;
        setData(json);
        setError(false);
      })
      .catch((err) => {
        console.error("Failed to load stats:", err);
        // A failed background revalidation keeps showing cached data — only a
        // cold start with nothing to render falls into the error state.
        if (!cancelled && statsCache === null) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // ---- Semester filter ------------------------------------------------------
  // Semesters offered by the selector: those present on active items.
  const semesters = useMemo(
    () => Array.from(new Set(items.map((it) => it.semester))).sort((a, b) => a - b),
    [items],
  );

  /**
   * Filtered data sources. Items carry `semester` directly; ReviewLog rows do
   * NOT, so each log is attributed to a semester via its itemId → item lookup.
   * For logs whose item was deleted (itemId is a soft reference) we fall back
   * to a subjectMain+subjectSub match against active items (first match wins
   * if a module name ever repeats across semesters). Logs that can't be
   * attributed either way only appear under "All semesters" — guessing a
   * semester would corrupt per-semester pass rates.
   */
  const filtered = useMemo(() => {
    const logs = data?.logs ?? [];
    if (semesterFilter === "all") return { logs, items };

    const byId = new Map<string, number>();
    const bySubject = new Map<string, number>();
    for (const it of items) {
      byId.set(it.id, it.semester);
      const key = `${it.subjectMain}\u0000${it.subjectSub}`;
      if (!bySubject.has(key)) bySubject.set(key, it.semester);
    }
    return {
      logs: logs.filter((log) => {
        const sem =
          (log.itemId !== null ? byId.get(log.itemId) : undefined) ??
          bySubject.get(`${log.subjectMain}\u0000${log.subjectSub}`);
        return sem === semesterFilter;
      }),
      items: items.filter((it) => it.semester === semesterFilter),
    };
  }, [data, items, semesterFilter]);

  // Which local day it is. Refreshed when the tab regains focus/visibility so
  // the panel doesn't keep showing yesterday's "today" (streak/heatmap/forecast)
  // if it stays mounted across local midnight.
  const [dayStamp, setDayStamp] = useState(() => dayKey(startOfLocalDay(new Date())));
  useEffect(() => {
    const refresh = () => {
      const k = dayKey(startOfLocalDay(new Date()));
      setDayStamp((prev) => (prev === k ? prev : k));
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const id = window.setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(id);
    };
  }, []);

  // ---- Aggregations (all local-time) ---------------------------------------
  const computed = useMemo(() => {
    void dayStamp; // referenced so the memo recomputes when the local day rolls over
    const { logs, items } = filtered;
    const today = startOfLocalDay(new Date());

    // Reviews per local day
    const byDay = new Map<string, { count: number; passed: number }>();
    for (const log of logs) {
      const key = dayKey(new Date(log.completedAt));
      const entry = byDay.get(key) ?? { count: 0, passed: 0 };
      entry.count += 1;
      if (log.passed) entry.passed += 1;
      byDay.set(key, entry);
    }

    // Streak: consecutive days with ≥1 review, ending today (or yesterday if
    // today has none yet — an unbroken streak shouldn't show 0 at breakfast).
    let streak = 0;
    let cursor = byDay.has(dayKey(today)) ? today : addDays(today, -1);
    while (byDay.has(dayKey(cursor))) {
      streak += 1;
      cursor = addDays(cursor, -1);
    }

    // Heatmap: last 25 full weeks + current week (≈ 6 months, per the design's
    // "Last 6 months"), columns = weeks, rows = Mon–Sun. A column is labeled
    // with its month when it contains the 1st (or is the first column).
    const dowMon0 = (today.getDay() + 6) % 7; // Mon=0 … Sun=6
    const thisMonday = addDays(today, -dowMon0);
    const firstMonday = addDays(thisMonday, -25 * 7);
    const weeks: { label: string | null; days: { key: string; count: number; date: Date; future: boolean }[] }[] = [];
    for (let w = 0; w < 26; w++) {
      const col: { key: string; count: number; date: Date; future: boolean }[] = [];
      let label: string | null = null;
      for (let d = 0; d < 7; d++) {
        const date = addDays(firstMonday, w * 7 + d);
        const key = dayKey(date);
        if (w === 0 && d === 0) label = date.toLocaleDateString(locale, { month: "short" });
        if (date.getDate() === 1 && w > 0) label = date.toLocaleDateString(locale, { month: "short" });
        col.push({ key, date, count: byDay.get(key)?.count ?? 0, future: date > today });
      }
      weeks.push({ label, days: col });
    }

    // Pass rate over the last 30 days
    const cutoff30 = addDays(today, -30);
    let recent = 0;
    let recentPassed = 0;
    for (const log of logs) {
      const d = new Date(log.completedAt);
      if (d >= cutoff30) {
        recent += 1;
        if (log.passed) recentPassed += 1;
      }
    }

    // Per-module stats (logs) + active item info (items)
    const moduleMap = new Map<string, { count: number; passed: number; items: number; levelSum: number }>();
    for (const log of logs) {
      const m = moduleMap.get(log.subjectMain) ?? { count: 0, passed: 0, items: 0, levelSum: 0 };
      m.count += 1;
      if (log.passed) m.passed += 1;
      moduleMap.set(log.subjectMain, m);
    }
    for (const item of items) {
      const m = moduleMap.get(item.subjectMain) ?? { count: 0, passed: 0, items: 0, levelSum: 0 };
      m.items += 1;
      m.levelSum += item.currentLevel;
      moduleMap.set(item.subjectMain, m);
    }
    const modules = Array.from(moduleMap.entries())
      .map(([name, m]) => ({
        name,
        reviews: m.count,
        passRate: m.count > 0 ? Math.round((m.passed / m.count) * 100) : null,
        items: m.items,
        avgLevel: m.items > 0 ? m.levelSum / m.items : 0,
      }))
      // IA-10: riskiest first — the chart's job is "which module needs me?",
      // and a struggling, avoided module must not sort out of sight. Modules
      // without any reviews (no pass rate yet) go last.
      .sort((a, b) => {
        if (a.passRate === null || b.passRate === null) {
          if (a.passRate === b.passRate) return b.items - a.items;
          return a.passRate === null ? 1 : -1;
        }
        return a.passRate - b.passRate || b.reviews - a.reviews;
      });

    // Due forecast: overdue collapses into "today", then 13 more days.
    const forecast: { date: Date; count: number; isToday: boolean }[] = Array.from({ length: 14 }, (_, i) => ({
      date: addDays(today, i),
      count: 0,
      isToday: i === 0,
    }));
    for (const item of items) {
      const due = startOfLocalDay(new Date(item.nextReviewDate));
      const diff = Math.round((due.getTime() - today.getTime()) / 86_400_000);
      const idx = Math.min(Math.max(diff, 0), 13);
      if (diff <= 13) forecast[idx].count += 1;
    }

    // Level distribution of active items (levels 6+ share the last bucket)
    const levelDist = new Array<number>(7).fill(0);
    for (const item of items) {
      levelDist[Math.min(Math.max(item.currentLevel, 0), 6)] += 1;
    }

    const dueToday = forecast[0].count;
    const maxForecast = Math.max(1, ...forecast.map((f) => f.count));
    const maxLevel = Math.max(1, ...levelDist);

    // AX-9: numbers for the heatmap's text alternative — the per-day data
    // otherwise lives only in hover tooltips, invisible to AT.
    let activeDays = 0;
    let pastDays = 0;
    let busiestDay: { date: Date; count: number } | null = null;
    for (const week of weeks) {
      for (const day of week.days) {
        if (day.future) continue;
        pastDays += 1;
        if (day.count === 0) continue;
        activeDays += 1;
        if (busiestDay === null || day.count > busiestDay.count) busiestDay = { date: day.date, count: day.count };
      }
    }

    return { streak, weeks, recent, recentPassed, modules, forecast, levelDist, dueToday, maxForecast, maxLevel, activeDays, pastDays, busiestDay };
    // dayStamp: recompute when the local day rolls over (see effect above).
  }, [filtered, locale, dayStamp]);

  /* Heatmap ramp per Stats.dc.html: zero = var(--chart-zero), then amber washes
     0.4 → 0.5 → 0.72 → solid var(--a-g2). Non-zero cells also carry a hairline
     accent border: luminance alone can't separate "studied once" from an empty
     day (CC-9, WCAG 1.4.11), so activity is encoded with more than hue.
     No glow — quiet until touched. */
  const HEAT_RING = "border border-[color-mix(in_srgb,var(--a-g3)_35%,transparent)]";
  const heatColor = (count: number, future: boolean): string => {
    if (future) return "bg-transparent border border-(--heat-future-border)";
    if (count === 0) return "bg-(--chart-zero)";
    if (count === 1) return `bg-(--accent-heat-1) ${HEAT_RING}`;
    if (count <= 2) return `bg-(--accent-heat-2) ${HEAT_RING}`;
    if (count <= 4) return `bg-(--accent-heat-3) ${HEAT_RING}`;
    return `bg-(--a-g2) ${HEAT_RING}`;
  };

  // LS-8: the heatmap opens anchored to today (the rightmost column) and shows
  // edge fades while more weeks hide inside the scroller. Opacity-only motion.
  const heatScrollRef = useRef<HTMLDivElement | null>(null);
  const [heatFade, setHeatFade] = useState({ left: false, right: false });
  const updateHeatFade = useCallback(() => {
    const el = heatScrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setHeatFade((prev) => {
      const next = { left: el.scrollLeft > 2, right: el.scrollLeft < max - 2 };
      return prev.left === next.left && prev.right === next.right ? prev : next;
    });
  }, []);
  useLayoutEffect(() => {
    const el = heatScrollRef.current;
    if (!el) return;
    el.scrollLeft = el.scrollWidth;
    updateHeatFade();
  }, [loading, error, updateHeatFade]);

  const passRate30 = computed.recent > 0 ? Math.round((computed.recentPassed / computed.recent) * 100) : null;

  // AX-9: the heatmap's visually-hidden summary sentence.
  const busiest = computed.busiestDay;
  const heatSummary =
    busiest === null
      ? de
        ? "Noch keine Wiederholungen in den letzten 6 Monaten."
        : "No reviews in the last 6 months."
      : de
        ? `An ${computed.activeDays} von ${computed.pastDays} Tagen gelernt. Stärkster Tag: ${busiest.date.toLocaleDateString(locale, { day: "numeric", month: "long" })} mit ${busiest.count} ${busiest.count === 1 ? "Wiederholung" : "Wiederholungen"}.`
        : `Studied on ${computed.activeDays} of the last ${computed.pastDays} days. Busiest day: ${busiest.date.toLocaleDateString(locale, { day: "numeric", month: "long" })} with ${busiest.count} ${busiest.count === 1 ? "review" : "reviews"}.`;
  // All-time totals only exist unfiltered (server-side count). With a semester
  // selected we count the filtered logs instead — they span the last 12 months,
  // so the card's sub-label switches to say exactly that.
  const totalReviews = semesterFilter === "all" ? (data?.totals.total ?? 0) : filtered.logs.length;

  // ---- Loading skeleton --------------------------------------------------
  // Mirrors the final layout EXACTLY — same wrapper gaps, same surfaces, same
  // section count — so nothing shifts at the skeleton→data handoff (LS-7/EL-5).
  if (loading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={de ? "Statistiken werden geladen" : "Loading statistics"}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card-surface-elevated p-5">
              <div className="w-5 h-5 rounded-md bg-paper-2 mb-4" />
              <div className="w-14 h-8 rounded-lg bg-paper-2 mb-3" />
              <div className="w-24 h-2.5 rounded-full bg-paper-2 mb-2" />
              <div className="w-16 h-2 rounded-full bg-paper-0" />
            </div>
          ))}
        </div>
        <div className="card-surface p-5 md:px-6 md:py-[22px]">
          <div className="w-56 h-3 rounded-full bg-paper-2 mb-6" />
          <div className="h-28 rounded-xl bg-paper-0" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
          <div className="card-surface p-5 md:px-6 md:py-[22px]">
            <div className="w-48 h-3 rounded-full bg-paper-2 mb-6" />
            <div className="flex flex-col gap-4">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i}>
                  <div className="w-32 h-2.5 rounded-full bg-paper-2 mb-2" />
                  <div className="w-full h-[7px] rounded-full bg-paper-2" />
                </div>
              ))}
            </div>
          </div>
          <div className="card-surface p-5 md:px-6 md:py-[22px]">
            <div className="w-48 h-3 rounded-full bg-paper-2 mb-6" />
            <div className="flex items-end gap-1.5 h-[150px]">
              {[35, 60, 20, 80, 45, 25, 70, 40, 55, 30, 65, 22, 50, 38].map((h, i) => (
                <div key={i} className="flex-1 rounded-t-md bg-paper-2" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
        </div>
        <div className="card-surface p-5 md:px-6 md:py-[22px]">
          <div className="w-48 h-3 rounded-full bg-paper-2 mb-6" />
          <div className="flex items-end gap-3 sm:gap-3.5 h-[130px]">
            {[40, 65, 85, 55, 30, 20, 12].map((h, i) => (
              <div key={i} className="flex-1 rounded-t-lg bg-paper-2" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card-surface p-14 flex flex-col items-center text-center">
        <div className="w-12 h-12 rounded-2xl bg-(--grade-fail-wash) border border-(--grade-fail-border) flex items-center justify-center mb-5">
          <ExclamationTriangleIcon className="w-6 h-6 text-(--grade-fail-text)" />
        </div>
        <p className="text-ink-600 text-sm">{de ? "Statistiken konnten nicht geladen werden." : "Couldn't load statistics."}</p>
        {/* EM-6: an error state without a way out is just an error message —
            same recovery affordance as the Library's failure card. */}
        <button
          type="button"
          onClick={() => {
            setError(false);
            setLoading(true);
            setReloadKey((k) => k + 1);
          }}
          className="btn-primary h-11 px-6 text-sm mt-7 cursor-pointer"
        >
          {de ? "Erneut versuchen" : "Try again"}
        </button>
      </div>
    );
  }

  // Empty state — no reviews logged and no active lectures yet.
  if ((data?.totals.total ?? 0) === 0 && items.length === 0) {
    return (
      <div className="card-surface p-12 md:p-16 flex flex-col items-center text-center">
        <div className="w-[52px] h-[52px] rounded-2xl bg-paper-2 flex items-center justify-center mb-6">
          <ArrowTrendingUpIcon className="w-6 h-6 text-ink-400" strokeWidth={1.6} />
        </div>
        <h3 className="font-display text-[22px] text-ink-900 mb-2.5" style={{ fontWeight: 480 }}>
          {de ? "Noch keine Daten" : "No data yet"}
        </h3>
        <p className="text-ink-600 text-sm leading-relaxed max-w-sm">
          {de ? "Deine erste Wiederholung schreibt den ersten Datenpunkt." : "Your first review writes the first data point."}
        </p>
      </div>
    );
  }

  const statCards: {
    icon: ReactNode;
    label: string;
    value: number | null;
    suffix?: string;
    /** LIVE-10: a phrase that replaces the value — the zero moment as invitation. */
    zeroText?: string;
    sub: string;
  }[] = [
    {
      icon: <FireIcon className={`w-4 h-4 ${computed.streak > 0 ? "text-amber-500" : "text-ink-400"}`} strokeWidth={1.7} />,
      label: de ? "Tage-Streak" : "Day streak",
      value: computed.streak,
      // LIVE-10: a zero streak is an invitation, not a failure stat — lead
      // with today instead of the bare zero.
      zeroText: computed.streak === 0 ? (de ? "Heute zählt" : "Today counts") : undefined,
      sub:
        computed.streak > 0
          ? de
            ? "Tage in Folge gelernt"
            : "consecutive study days"
          : computed.dueToday > 0
            ? de
              ? computed.dueToday === 1
                ? "eine Wiederholung wartet auf dich"
                : `${computed.dueToday} Wiederholungen warten auf dich`
              : computed.dueToday === 1
                ? "one review is waiting for you"
                : `${computed.dueToday} reviews are waiting for you`
            : de
              ? "deine nächste Wiederholung startet die Serie"
              : "your next review starts the streak",
    },
    {
      icon: <ClockIcon className="w-4 h-4 text-ink-400" strokeWidth={1.7} />,
      label: de ? "Heute fällig" : "Due today",
      value: computed.dueToday,
      sub:
        computed.dueToday > 0
          ? de
            ? `~${computed.dueToday * 7} Minuten`
            : `~${computed.dueToday * 7} minutes`
          : de
            ? "inkl. überfälliger Wiederholungen"
            : "incl. overdue reviews",
    },
    {
      icon: <ArrowTrendingUpIcon className="w-4 h-4 text-(--grade-pass-accent)" strokeWidth={1.7} />,
      label: de ? "Quote · 30 T." : "Pass rate · 30d",
      value: passRate30,
      // TY-4: the numeral animates separately, so the sign carries its own
      // narrow no-break space in German (DIN 5008) — cf. fmtPercent().
      suffix: de ? "\u202F%" : "%",
      sub:
        computed.recent > 0
          ? de
            ? `${computed.recentPassed} von ${computed.recent} bestanden`
            : `${computed.recentPassed} of ${computed.recent} passed`
          : de
            ? "noch keine Wiederholungen"
            : "no reviews yet",
    },
    {
      icon: <CheckCircleIcon className="w-4 h-4 text-ink-400" strokeWidth={1.7} />,
      label: de ? "Wiederholungen gesamt" : "Total reviews",
      value: totalReviews,
      sub:
        semesterFilter === "all"
          ? de ? "seit Beginn" : "all time"
          : de ? "letzte 12 Monate" : "last 12 months",
    },
  ];

  return (
    <motion.div variants={staggerContainer} initial={appear ? "initial" : false} animate="animate" className="flex flex-col gap-4">
      {/* ── Semester filter ── (only shown once a second semester exists) */}
      {semesters.length > 1 && (
        <motion.div
          variants={riseChild}
          role="group"
          aria-label={de ? "Statistiken nach Semester filtern" : "Filter statistics by semester"}
          className="flex items-center gap-2 overflow-x-auto custom-scrollbar -mb-1 pb-1"
        >
          <span className="caps-label shrink-0 mr-1 hidden sm:inline">{de ? "Zeitraum" : "Period"}</span>
          <button
            type="button"
            onClick={() => setSemesterFilter("all")}
            aria-pressed={semesterFilter === "all"}
            className={`chip shrink-0 cursor-pointer ${semesterFilter === "all" ? "chip-amber" : ""}`}
          >
            {de ? "Alle Semester" : "All semesters"}
          </button>
          {semesters.map((sem) => (
            <button
              key={sem}
              type="button"
              onClick={() => setSemesterFilter(sem)}
              aria-pressed={semesterFilter === sem}
              aria-label={`Semester ${sem}`}
              className={`chip shrink-0 cursor-pointer tabular-nums ${semesterFilter === sem ? "chip-amber" : ""}`}
            >
              {`Sem. ${sem}`}
            </button>
          ))}
        </motion.div>
      )}

      {/* ── Stat cards ── */}
      <motion.div variants={riseChild} className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {statCards.map((card) => (
          <div key={card.label} className="card-surface-elevated p-5">
            <div className="flex items-center gap-2">
              {card.icon}
              <span className="caps-label tracking-[0.1em]">{card.label}</span>
            </div>
            <div
              className="font-display text-[34px] lg:text-[40px] leading-none tracking-[-0.01em] tabular-nums text-ink-900 mt-2.5"
              style={{ fontWeight: 520 }}
            >
              {card.zeroText ? (
                /* LIVE-10: same line box as the numerals (the container's
                   font-size keeps the strut), so the card doesn't reflow. */
                <span className="text-[22px] tracking-[-0.005em]" style={{ fontWeight: 480 }}>
                  {card.zeroText}
                </span>
              ) : typeof card.value === "number" ? (
                <>
                  <AnimatedNumber value={card.value} appear={appear} />
                  {card.suffix ? <span className="text-2xl text-ink-600">{card.suffix}</span> : null}
                </>
              ) : (
                "—"
              )}
            </div>
            <div className="text-xs text-ink-600 mt-1.5">{card.sub}</div>
          </div>
        ))}
      </motion.div>

      {/* ── Activity heatmap (≈ 6 months) ── */}
      <motion.div variants={riseChild} className="card-surface p-5 md:px-6 md:py-[22px]">
        <div className="flex items-baseline justify-between mb-4">
          <h4 className="text-sm text-ink-900" style={{ fontWeight: 650 }}>
            {de ? "Aktivität" : "Activity"}
          </h4>
          <span className="text-xs text-ink-400">{de ? "Letzte 6 Monate" : "Last 6 months"}</span>
        </div>
        {/* AX-9: the per-day data lives in hover tooltips on plain divs — this
            sentence is the grid's text alternative for AT. */}
        <p className="sr-only">{heatSummary}</p>
        <div className="relative">
          <div ref={heatScrollRef} onScroll={updateHeatFade} className="overflow-x-auto custom-scrollbar pb-1">
            <div className="flex gap-1 min-w-max" aria-hidden="true">
              {/* Weekday gutter (with a spacer matching the month-label row).
                  Sticky so the labels survive the auto-scroll to "today" (LS-8). */}
              <div className="flex flex-col gap-1 pr-1.5 text-[10px] text-ink-400 sticky left-0 z-[1] bg-paper-1">
                <span className="h-3" aria-hidden="true" />
                <span className="h-[13px] leading-[13px]">{de ? "Mo" : "Mon"}</span>
                <span className="h-[13px]" />
                <span className="h-[13px]" />
                <span className="h-[13px] leading-[13px]">{de ? "Do" : "Thu"}</span>
                <span className="h-[13px]" />
                <span className="h-[13px]" />
                <span className="h-[13px] leading-[13px]">{de ? "So" : "Sun"}</span>
              </div>
              {computed.weeks.map((week, w) => (
                <motion.div
                  key={w}
                  initial={appear ? { opacity: 0, y: 8 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: DUR.gentle, ease: EASE_OUT, delay: 0.15 + Math.min(w, 8) * 0.03 }}
                  className="flex flex-col gap-1"
                >
                  <span className="h-3 text-[10px] text-ink-400 leading-3 whitespace-nowrap">{week.label ?? ""}</span>
                  {week.days.map((cell) => (
                    <Tip key={cell.key} label={`${cell.date.toLocaleDateString(locale)} — ${cell.count} ${de ? (cell.count === 1 ? "Wiederholung" : "Wiederholungen") : (cell.count === 1 ? "review" : "reviews")}`}>
                      <div className={`heat-cell w-[13px] h-[13px] rounded-[3px] ${heatColor(cell.count, cell.future)}`} />
                    </Tip>
                  ))}
                </motion.div>
              ))}
            </div>
          </div>
          {/* LS-8: edge fades so truncation reads as "more here" (opacity-only). */}
          <div
            className={`pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-paper-1 to-transparent transition-opacity duration-150 ${heatFade.left ? "opacity-100" : "opacity-0"}`}
          />
          <div
            className={`pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-paper-1 to-transparent transition-opacity duration-150 ${heatFade.right ? "opacity-100" : "opacity-0"}`}
          />
        </div>
        <div className="flex items-center justify-end gap-1.5 mt-4 text-[10px] text-ink-400" aria-hidden="true">
          {de ? "Weniger" : "Less"}
          <div className="w-3 h-3 rounded-[3px] bg-(--chart-zero)" />
          <div className={`w-3 h-3 rounded-[3px] bg-(--accent-heat-1) ${HEAT_RING}`} />
          <div className={`w-3 h-3 rounded-[3px] bg-(--accent-heat-2) ${HEAT_RING}`} />
          <div className={`w-3 h-3 rounded-[3px] bg-(--accent-heat-3) ${HEAT_RING}`} />
          <div className={`w-3 h-3 rounded-[3px] bg-(--a-g2) ${HEAT_RING}`} />
          {de ? "Mehr" : "More"}
        </div>
      </motion.div>

      <motion.div variants={riseChild} className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        {/* ── Per-module stats ── */}
        <div className="card-surface p-5 md:px-6 md:py-[22px]">
          <h4 className="text-sm text-ink-900 mb-[18px]" style={{ fontWeight: 650 }}>
            {de ? "Bestehensquote nach Modul" : "Pass rate by module"}
          </h4>
          {computed.modules.length === 0 ? (
            <p className="text-ink-600 text-sm">{de ? "Noch keine Daten." : "No data yet."}</p>
          ) : (
            <div className="flex flex-col gap-4">
              {(showAllModules ? computed.modules : computed.modules.slice(0, 8)).map((mod, i) => (
                <div key={mod.name}>
                  <Tip label={`${mod.reviews} ${de ? (mod.reviews === 1 ? "Wiederholung" : "Wiederholungen") : (mod.reviews === 1 ? "review" : "reviews")}${mod.items > 0 ? ` · ${mod.items} ${de ? "Vorl." : "lect."} · Ø L${(mod.avgLevel + 1).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}` : ""}`}>
                  <div className="flex justify-between gap-3 text-[13px] mb-[7px]">
                    <span className="text-ink-900 truncate" style={{ fontWeight: 550 }}>{mod.name}</span>
                    <span className="text-ink-600 tabular-nums whitespace-nowrap">
                      {mod.passRate === null ? "—" : fmtPercent(mod.passRate, language)}
                    </span>
                  </div>
                  </Tip>
                  <div className="h-[7px] rounded-full bg-paper-2 overflow-hidden">
                    {/* Fill scales via transform — box width stays constant */}
                    <div className="h-full" style={{ width: `${mod.passRate ?? 0}%` }}>
                      <motion.div
                        initial={appear && !entranceDone ? { scaleX: 0 } : false}
                        animate={{ scaleX: 1 }}
                        transition={{ duration: DUR.gentle, ease: EASE_OUT, delay: 0.15 + Math.min(i, 8) * 0.03 }}
                        style={{ transformOrigin: "left" }}
                        className={`h-full w-full rounded-full ${mod.passRate !== null && mod.passRate >= 80 ? "bg-(--grade-pass-accent)" : mod.passRate !== null && mod.passRate >= 50 ? "bg-(--grade-mid)" : "bg-(--grade-fail-accent)"}`}
                      />
                    </div>
                  </div>
                </div>
              ))}
              {/* IA-10: never truncate silently — the cut is visible and reversible. */}
              {computed.modules.length > 8 && (
                <button
                  type="button"
                  onClick={() => setShowAllModules((v) => !v)}
                  className="self-start text-[13px] text-ink-600 hover:text-ink-900 transition-colors cursor-pointer"
                  style={{ fontWeight: 550 }}
                >
                  {showAllModules
                    ? de ? "Weniger anzeigen" : "Show fewer"
                    : de
                      ? computed.modules.length - 8 === 1
                        ? "+1 weiteres Modul"
                        : `+${computed.modules.length - 8} weitere Module`
                      : computed.modules.length - 8 === 1
                        ? "+1 more module"
                        : `+${computed.modules.length - 8} more modules`}
                </button>
              )}
            </div>
          )}
          <p className="text-[11px] text-ink-400 mt-[18px]">
            {de
              ? "Balken zeigen die Bestehensquote der letzten 12 Monate — niedrigste zuerst."
              : "Bars show pass rate over the last 12 months — lowest first."}
          </p>
        </div>

        {/* ── Review load · next 14 days ── */}
        <div className="card-surface p-5 md:px-6 md:py-[22px]">
          <h4 className="text-sm text-ink-900" style={{ fontWeight: 650 }}>
            {de ? "Pensum · nächste 14 Tage" : "Review load · next 14 days"}
          </h4>
          <div className="flex items-end gap-1.5 h-[150px] mt-5">
            {computed.forecast.map((day, i) => (
              <Tip key={i} label={`${day.date.toLocaleDateString(locale)} — ${day.count} ${de ? "fällig" : "due"}`}>
              <div className="flex-1 flex flex-col items-center justify-end h-full min-w-0 gap-2">
                <span className="text-xs font-semibold tabular-nums text-ink-600">{day.count}</span>
                {/* Fixed-height slot; the fill scales via transform (never height) */}
                <div
                  className="w-full flex flex-col justify-end"
                  style={{ height: day.count === 0 ? "4px" : `${Math.max(4, (day.count / computed.maxForecast) * 100)}%` }}
                >
                  <motion.div
                    initial={appear ? { scaleY: 0 } : false}
                    animate={{ scaleY: 1 }}
                    transition={{ duration: DUR.gentle, ease: EASE_OUT, delay: 0.1 + Math.min(i, 8) * 0.03 }}
                    style={{ transformOrigin: "bottom" }}
                    className={`w-full h-full rounded-t-[5px] ${
                      day.count === 0
                        ? "bg-(--chart-stub)"
                        : day.isToday
                          ? "bg-(--a-g2)"
                          : "bg-[color-mix(in_srgb,var(--a-g2)_40%,transparent)]"
                    }`}
                  />
                </div>
                <span className={`text-[9px] whitespace-nowrap ${day.isToday ? "text-(--accent-text-strong) font-bold" : "text-ink-400"}`}>
                  {day.isToday
                    ? de ? "Heute" : "Today"
                    : day.date.toLocaleDateString(locale, { weekday: "short" }).replace(".", "")}
                </span>
              </div>
              </Tip>
            ))}
          </div>
          <p className="text-[11px] text-ink-400 mt-3.5">
            {de
              ? "Heute trägt die größte Last — von hier aus wird es leichter."
              : "Today carries the heaviest load — it eases from here."}
          </p>
        </div>
      </motion.div>

      {/* ── Level distribution (full width) ── */}
      <motion.div variants={riseChild} className="card-surface p-5 md:px-6 md:py-[22px]">
          <h4 className="text-sm text-ink-900 mb-5" style={{ fontWeight: 650 }}>
            {de ? "Wo deine Vorlesungen stehen" : "Where your lectures sit"}
          </h4>
          <div className="flex items-end gap-3 sm:gap-3.5 h-[130px]">
            {computed.levelDist.map((count, level) => (
              <Tip key={level} label={`Level ${level + 1} (${LEVEL_LABELS[level]}) — ${count} ${de ? (count === 1 ? "Vorlesung" : "Vorlesungen") : (count === 1 ? "lecture" : "lectures")}`}>
              <div className="flex-1 flex flex-col items-center justify-end h-full gap-2">
                <span className="text-xs font-semibold tabular-nums text-ink-600">{count}</span>
                {/* Fixed-height slot; the fill scales via transform (never height) */}
                <div
                  className="w-full flex flex-col justify-end"
                  style={{ height: count === 0 ? "4px" : `${Math.max(4, (count / computed.maxLevel) * 100)}%` }}
                >
                  <motion.div
                    initial={appear ? { scaleY: 0 } : false}
                    animate={{ scaleY: 1 }}
                    transition={{ duration: DUR.gentle, ease: EASE_OUT, delay: 0.2 + level * 0.03 }}
                    style={{
                      transformOrigin: "bottom",
                      /* Amber intensity scales with height; the tallest bar is solid. */
                      background:
                        count === 0
                          ? "var(--chart-stub)"
                          : count === computed.maxLevel
                            ? "var(--a-g2)"
                            : `color-mix(in srgb, var(--a-g2) ${Math.round((0.12 + 0.45 * (count / computed.maxLevel)) * 100)}%, transparent)`,
                    }}
                    className="w-full h-full rounded-t-lg"
                  />
                </div>
                <span className="text-[10px] text-ink-400">{LEVEL_LABELS[level]}</span>
              </div>
              </Tip>
            ))}
          </div>
          <p className="text-[11px] text-ink-400 mt-[18px]">
            {de
              ? "Jede Vorlesung klettert mit jedem Bestehen vom 1-Tages-Intervall Richtung Jahresintervall."
              : "Each lecture climbs from a 1-day interval toward a yearly one as you keep passing."}
          </p>
      </motion.div>
    </motion.div>
  );
}
