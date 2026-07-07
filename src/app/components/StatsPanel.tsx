"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, animate, useReducedMotion } from "framer-motion";
import { staggerContainer, riseChild, EASE_OUT } from "@/lib/motion";
import {
  FireIcon,
  CheckCircleIcon,
  ClockIcon,
  ArrowTrendingUpIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { Tip } from "./Tooltip";

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
function AnimatedNumber({ value }: { value: number }) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(0);

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

  const [data, setData] = useState<StatsResponse | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  /** Semester filter — "all" (default) or a semester number present in `items`. */
  const [semesterFilter, setSemesterFilter] = useState<number | "all">("all");

  useEffect(() => {
    let cancelled = false;
    // `loading` starts true — no synchronous setState needed here.
    fetch("/api/stats")
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.json();
      })
      .then((json: StatsResponse) => {
        if (cancelled) return;
        setData(json);
        setError(false);
      })
      .catch((err) => {
        console.error("Failed to load stats:", err);
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
      .sort((a, b) => b.reviews - a.reviews || b.items - a.items);

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

    return { streak, weeks, recent, recentPassed, modules, forecast, levelDist, dueToday, maxForecast, maxLevel };
    // dayStamp: recompute when the local day rolls over (see effect above).
  }, [filtered, locale, dayStamp]);

  /* Heatmap ramp per Stats.dc.html: zero = var(--chart-zero), then amber-500 washes
     0.28 → 0.5 → 0.72 → solid var(--a-g2). No glow — quiet until touched. */
  const heatColor = (count: number, future: boolean): string => {
    if (future) return "bg-transparent border border-(--heat-future-border)";
    if (count === 0) return "bg-(--chart-zero)";
    if (count === 1) return "bg-(--accent-heat-1)";
    if (count <= 2) return "bg-(--accent-heat-2)";
    if (count <= 4) return "bg-(--accent-heat-3)";
    return "bg-(--a-g2)";
  };

  const passRate30 = computed.recent > 0 ? Math.round((computed.recentPassed / computed.recent) * 100) : null;
  // All-time totals only exist unfiltered (server-side count). With a semester
  // selected we count the filtered logs instead — they span the last 12 months,
  // so the card's sub-label switches to say exactly that.
  const totalReviews = semesterFilter === "all" ? (data?.totals.total ?? 0) : filtered.logs.length;

  // ---- Loading skeleton (mirrors the final layout, so nothing jumps) --------
  if (loading) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true" aria-label={de ? "Statistiken werden geladen" : "Loading statistics"}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card-surface p-5" style={{ animationDelay: `${i * 120}ms` }}>
              <div className="w-5 h-5 rounded-md bg-paper-2 mb-4" />
              <div className="w-14 h-8 rounded-lg bg-paper-2 mb-3" />
              <div className="w-24 h-2.5 rounded-full bg-paper-2 mb-2" />
              <div className="w-16 h-2 rounded-full bg-paper-0" />
            </div>
          ))}
        </div>
        <div className="card-surface p-6">
          <div className="w-56 h-3 rounded-full bg-paper-2 mb-6" />
          <div className="flex items-end gap-2 h-32">
            {[35, 60, 20, 80, 45, 25, 70, 40, 55, 30, 65, 22, 50, 38].map((h, i) => (
              <div key={i} className="flex-1 rounded-t-md bg-paper-2" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
        <div className="card-surface p-6">
          <div className="w-48 h-3 rounded-full bg-paper-2 mb-6" />
          <div className="h-28 rounded-xl bg-paper-0" />
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
          {de ? "Dein erstes Review schreibt den ersten Datenpunkt." : "Your first review writes the first data point."}
        </p>
      </div>
    );
  }

  const statCards = [
    {
      icon: <FireIcon className={`w-4 h-4 ${computed.streak > 0 ? "text-amber-500" : "text-ink-300"}`} strokeWidth={1.7} />,
      label: de ? "Tage-Streak" : "Day streak",
      value: computed.streak,
      sub: de ? "Tage in Folge gelernt" : "consecutive study days",
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
            ? "inkl. überfälliger Reviews"
            : "incl. overdue reviews",
    },
    {
      icon: <ArrowTrendingUpIcon className="w-4 h-4 text-(--grade-pass-accent)" strokeWidth={1.7} />,
      label: de ? "Quote · 30 T." : "Pass rate · 30d",
      value: passRate30,
      suffix: "%",
      sub:
        computed.recent > 0
          ? de
            ? `${computed.recentPassed} von ${computed.recent} bestanden`
            : `${computed.recentPassed} of ${computed.recent} passed`
          : de
            ? "noch keine Reviews"
            : "no reviews yet",
    },
    {
      icon: <CheckCircleIcon className="w-4 h-4 text-ink-400" strokeWidth={1.7} />,
      label: de ? "Reviews gesamt" : "Total reviews",
      value: totalReviews,
      sub:
        semesterFilter === "all"
          ? de ? "seit Beginn" : "all time"
          : de ? "letzte 12 Monate" : "last 12 months",
    },
  ];

  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="flex flex-col gap-4">
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
          <div
            key={card.label}
            className="bg-paper-1 border border-hairline-card rounded-[18px] p-5 shadow-(--shadow-e2)"
          >
            <div className="flex items-center gap-2">
              {card.icon}
              <span className="caps-label tracking-[0.1em]">{card.label}</span>
            </div>
            <div
              className="font-display text-[34px] lg:text-[40px] leading-none tracking-[-0.01em] tabular-nums text-ink-900 mt-2.5"
              style={{ fontWeight: 520 }}
            >
              {typeof card.value === "number" ? (
                <>
                  <AnimatedNumber value={card.value} />
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
        <div className="overflow-x-auto custom-scrollbar pb-1">
          <div className="flex gap-1 min-w-max">
            {/* Weekday gutter (with a spacer matching the month-label row) */}
            <div className="flex flex-col gap-1 pr-1.5 text-[8px] text-ink-300">
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
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.15 + w * 0.035 }}
                className="flex flex-col gap-1"
              >
                <span className="h-3 text-[8px] text-ink-400 leading-3 whitespace-nowrap">{week.label ?? ""}</span>
                {week.days.map((cell) => (
                  <Tip key={cell.key} label={`${cell.date.toLocaleDateString(locale)} — ${cell.count} ${de ? (cell.count === 1 ? "Review" : "Reviews") : (cell.count === 1 ? "review" : "reviews")}`}>
                    <div className={`heat-cell w-[13px] h-[13px] rounded-[3px] ${heatColor(cell.count, cell.future)}`} />
                  </Tip>
                ))}
              </motion.div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-end gap-1.5 mt-4 text-[10px] text-ink-400">
          {de ? "Weniger" : "Less"}
          <div className="w-3 h-3 rounded-[3px] bg-(--chart-zero)" />
          <div className="w-3 h-3 rounded-[3px] bg-(--accent-heat-1)" />
          <div className="w-3 h-3 rounded-[3px] bg-(--accent-heat-2)" />
          <div className="w-3 h-3 rounded-[3px] bg-(--accent-heat-3)" />
          <div className="w-3 h-3 rounded-[3px] bg-(--a-g2)" />
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
            <p className="text-ink-300 text-sm">{de ? "Noch keine Daten." : "No data yet."}</p>
          ) : (
            <div className="flex flex-col gap-4">
              {computed.modules.slice(0, 8).map((mod, i) => (
                <div key={mod.name}>
                  <Tip label={`${mod.reviews} ${de ? "Reviews" : "reviews"}${mod.items > 0 ? ` · ${mod.items} ${de ? "Vorl." : "lect."} · Ø L${(mod.avgLevel + 1).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}` : ""}`}>
                  <div className="flex justify-between gap-3 text-[13px] mb-[7px]">
                    <span className="text-ink-900 truncate" style={{ fontWeight: 550 }}>{mod.name}</span>
                    <span className="text-ink-600 tabular-nums whitespace-nowrap">
                      {mod.passRate === null ? "—" : `${mod.passRate}%`}
                    </span>
                  </div>
                  </Tip>
                  <div className="h-[7px] rounded-full bg-paper-2 overflow-hidden">
                    {/* Fill scales via transform — box width stays constant */}
                    <div className="h-full" style={{ width: `${mod.passRate ?? 0}%` }}>
                      <motion.div
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.15 + Math.min(i, 8) * 0.03 }}
                        style={{ transformOrigin: "left" }}
                        className={`h-full w-full rounded-full ${mod.passRate !== null && mod.passRate >= 80 ? "bg-(--grade-pass-accent)" : mod.passRate !== null && mod.passRate >= 50 ? "bg-(--grade-mid)" : "bg-(--grade-fail-accent)"}`}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11.5px] text-ink-400 mt-[18px]">
            {de ? "Balken zeigt die Bestehensquote der letzten 12 Monate." : "Bar shows pass rate over the last 12 months."}
          </p>
        </div>

        {/* ── Review load · next 14 days ── */}
        <div className="card-surface p-5 md:px-6 md:py-[22px]">
          <h4 className="text-sm text-ink-900" style={{ fontWeight: 650 }}>
            {de ? "Review-Last · nächste 14 Tage" : "Review load · next 14 days"}
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
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.1 + Math.min(i, 8) * 0.03 }}
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
          <p className="text-[11.5px] text-ink-400 mt-3.5">
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
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.2 + level * 0.03 }}
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
          <p className="text-[11.5px] text-ink-400 mt-[18px]">
            {de
              ? "Jede Vorlesung klettert mit jedem Bestehen vom 1-Tages-Intervall Richtung Jahresintervall."
              : "Each lecture climbs from a 1-day interval toward a yearly one as you keep passing."}
          </p>
      </motion.div>
    </motion.div>
  );
}
