"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, animate, useReducedMotion } from "framer-motion";
import { staggerContainer, riseChild, EASE_OUT } from "@/lib/motion";
import {
  FireIcon,
  CheckCircleIcon,
  ClockIcon,
  AcademicCapIcon,
  ChartBarIcon,
  CalendarDaysIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

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
}

interface StatsResponse {
  logs: StatsLog[];
  totals: { total: number; passed: number };
}

export interface StatsItemSlim {
  nextReviewDate: string | Date;
  currentLevel: number;
  subjectMain: string;
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
  // With reduced motion the value is simply shown — no count-up, no setState in
  // the effect (values are mount-stable: the panel renders after data arrives).
  const [display, setDisplay] = useState(reduceMotion ? value : 0);

  useEffect(() => {
    if (reduceMotion) return;
    const controls = animate(0, value, {
      duration: 1.1,
      ease: EASE_OUT,
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [value, reduceMotion]);

  return <>{display}</>;
}

export default function StatsPanel({ items, language }: { items: StatsItemSlim[]; language: string }) {
  const de = language === "german";
  const locale = de ? "de-DE" : "en-US";

  const [data, setData] = useState<StatsResponse | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

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

  // ---- Aggregations (all local-time) ---------------------------------------
  const computed = useMemo(() => {
    const logs = data?.logs ?? [];
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

    // Heatmap: last 12 full weeks + current week, columns = weeks, rows = Mon–Sun.
    // A column is labeled with its month when it contains the 1st (or is the
    // first column), giving the grid a quiet time axis like a wall calendar.
    const dowMon0 = (today.getDay() + 6) % 7; // Mon=0 … Sun=6
    const thisMonday = addDays(today, -dowMon0);
    const firstMonday = addDays(thisMonday, -12 * 7);
    const weeks: { label: string | null; days: { key: string; count: number; date: Date; future: boolean }[] }[] = [];
    for (let w = 0; w < 13; w++) {
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
  }, [data, items, locale]);

  const heatColor = (count: number, future: boolean): string => {
    if (future) return "bg-transparent border border-[rgba(33,27,18,0.08)]";
    if (count === 0) return "bg-paper-2";
    if (count === 1) return "bg-amber-400/25";
    if (count <= 2) return "bg-amber-400/45";
    if (count <= 4) return "bg-amber-400/70";
    return "bg-amber-300 shadow-[0_0_8px_-1px_rgba(245,158,11,0.5)]";
  };

  const passRate30 = computed.recent > 0 ? Math.round((computed.recentPassed / computed.recent) * 100) : null;
  const totalReviews = data?.totals.total ?? 0;

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
        <div className="w-12 h-12 rounded-2xl bg-[rgba(176,106,78,0.10)] border border-[rgba(176,106,78,0.25)] flex items-center justify-center mb-5">
          <ExclamationTriangleIcon className="w-6 h-6 text-[#96543C]" />
        </div>
        <p className="text-ink-600 text-sm">{de ? "Statistiken konnten nicht geladen werden." : "Couldn't load statistics."}</p>
      </div>
    );
  }

  const statCards = [
    {
      icon: <FireIcon className={`w-5 h-5 ${computed.streak > 0 ? "text-amber-600 drop-shadow-[0_0_8px_rgba(245,158,11,0.55)]" : "text-ink-300"}`} />,
      label: de ? "Tage-Streak" : "Day streak",
      value: computed.streak,
      gradient: computed.streak >= 3,
      sub: de ? "Tage in Folge gelernt" : "consecutive study days",
    },
    {
      icon: <ClockIcon className="w-5 h-5 text-amber-600" />,
      label: de ? "Heute fällig" : "Due today",
      value: computed.dueToday,
      gradient: false,
      sub: de ? "inkl. überfälliger Reviews" : "incl. overdue reviews",
    },
    {
      icon: <CheckCircleIcon className="w-5 h-5 text-[#4A6845]" />,
      label: de ? "Bestehensquote (30 T.)" : "Pass rate (30 d)",
      value: passRate30,
      suffix: "%",
      gradient: false,
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
      icon: <AcademicCapIcon className="w-5 h-5 text-amber-600" />,
      label: de ? "Reviews gesamt" : "Total reviews",
      value: totalReviews,
      gradient: false,
      sub: de ? "seit Beginn" : "all time",
    },
  ];

  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="flex flex-col gap-6">
      {/* ── Stat cards ── */}
      <motion.div variants={riseChild} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="card-surface p-5 relative overflow-hidden">
            <div className="flex items-center gap-2 mb-3">{card.icon}</div>
            <div className={`font-display text-3xl font-medium leading-none tabular-nums text-ink-900`}>
              {typeof card.value === "number" ? (
                <>
                  <AnimatedNumber value={card.value} />
                  {card.suffix ?? ""}
                </>
              ) : (
                "—"
              )}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-600 mt-2.5">{card.label}</div>
            <div className="text-[11px] text-ink-300 mt-1">{card.sub}</div>
          </div>
        ))}
      </motion.div>

      {/* ── Due forecast (next 14 days) ── */}
      <motion.div variants={riseChild} className="card-surface p-5 md:p-6">
        <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-ink-600 mb-5 flex items-center gap-2">
          <CalendarDaysIcon className="w-4 h-4 text-amber-600" />
          {de ? "Anstehende Reviews — nächste 14 Tage" : "Upcoming reviews — next 14 days"}
        </h3>
        <div className="flex items-end gap-1.5 sm:gap-2 h-32">
          {computed.forecast.map((day, i) => (
            <div
              key={i}
              className="flex-1 flex flex-col items-center justify-end h-full min-w-0 group/bar"
              title={`${day.date.toLocaleDateString(locale)}: ${day.count} Reviews`}
            >
              <span className={`text-[10px] mb-1 tabular-nums transition-colors ${day.count > 0 ? "text-ink-600 font-semibold group-hover/bar:text-[#A15E03]" : "text-ink-300"}`}>{day.count}</span>
              {/* Fixed-height slot; the fill scales via transform (never height) */}
              <div className="w-full flex flex-col justify-end" style={{ height: `${Math.max(4, (day.count / computed.maxForecast) * 100)}%` }}>
                <motion.div
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.1 + Math.min(i, 8) * 0.03 }}
                  style={{ transformOrigin: "bottom" }}
                  className={`w-full h-full rounded-t-md ${
                    day.isToday
                      ? "bg-gradient-to-t from-amber-600 to-amber-300"
                      : day.count > 0
                        ? "bg-gradient-to-t from-[rgba(239,159,31,0.28)] to-[rgba(239,159,31,0.45)] group-hover/bar:from-[rgba(239,159,31,0.45)] group-hover/bar:to-[rgba(239,159,31,0.65)] transition-colors duration-300"
                        : "bg-paper-2"
                  }`}
                />
              </div>
              <span className={`text-[9px] mt-1.5 whitespace-nowrap ${day.isToday ? "text-amber-600 font-bold" : "text-ink-300"}`}>
                {day.isToday
                  ? de ? "Heute" : "Today"
                  : day.date.toLocaleDateString(locale, { weekday: "short" }).replace(".", "")}
              </span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-ink-300 mt-3">
          {de ? "Überfällige Reviews zählen zu „Heute“." : "Overdue reviews are counted under “Today”."}
        </p>
      </motion.div>

      {/* ── Activity heatmap (last 13 weeks) ── */}
      <motion.div variants={riseChild} className="card-surface p-5 md:p-6">
        <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-ink-600 mb-5 flex items-center gap-2">
          <ChartBarIcon className="w-4 h-4 text-amber-600" />
          {de ? "Aktivität — letzte 3 Monate" : "Activity — last 3 months"}
        </h3>
        <div className="overflow-x-auto custom-scrollbar pb-1">
          <div className="flex gap-2 min-w-max">
            {/* Weekday gutter (with a spacer matching the month-label row) */}
            <div className="flex flex-col gap-1 pr-1 text-[8px] text-ink-300">
              <span className="h-3" aria-hidden="true" />
              <span className="h-3.5 leading-[0.875rem]">{de ? "Mo" : "Mon"}</span>
              <span className="h-3.5" />
              <span className="h-3.5" />
              <span className="h-3.5 leading-[0.875rem]">{de ? "Do" : "Thu"}</span>
              <span className="h-3.5" />
              <span className="h-3.5" />
              <span className="h-3.5 leading-[0.875rem]">{de ? "So" : "Sun"}</span>
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
                  <div
                    key={cell.key}
                    title={`${cell.date.toLocaleDateString(locale)}: ${cell.count} ${cell.count === 1 ? "Review" : "Reviews"}`}
                    className={`w-3.5 h-3.5 rounded-[3px] transition-transform duration-200 hover:scale-125 ${heatColor(cell.count, cell.future)}`}
                  />
                ))}
              </motion.div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-4 text-[9px] text-ink-300">
          {de ? "Weniger" : "Less"}
          <div className="w-3 h-3 rounded-[3px] bg-paper-2" />
          <div className="w-3 h-3 rounded-[3px] bg-amber-400/25" />
          <div className="w-3 h-3 rounded-[3px] bg-amber-400/45" />
          <div className="w-3 h-3 rounded-[3px] bg-amber-400/70" />
          <div className="w-3 h-3 rounded-[3px] bg-amber-300" />
          {de ? "Mehr" : "More"}
        </div>
      </motion.div>

      <motion.div variants={riseChild} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Per-module stats ── */}
        <div className="card-surface p-5 md:p-6">
          <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-ink-600 mb-5 flex items-center gap-2">
            <AcademicCapIcon className="w-4 h-4 text-amber-600" />
            {de ? "Module" : "Modules"}
          </h3>
          {computed.modules.length === 0 ? (
            <p className="text-ink-300 text-sm">{de ? "Noch keine Daten." : "No data yet."}</p>
          ) : (
            <div className="space-y-4">
              {computed.modules.slice(0, 8).map((mod, i) => (
                <div key={mod.name}>
                  <div className="flex items-baseline justify-between gap-3 mb-1.5">
                    <span className="text-sm text-ink-900/85 truncate">{mod.name}</span>
                    <span className="text-[10px] text-ink-400 whitespace-nowrap tabular-nums">
                      {mod.reviews} {de ? "Reviews" : "reviews"}
                      {mod.items > 0 && <> · {mod.items} {de ? "Vorl." : "lect."} · Ø L{(mod.avgLevel + 1).toFixed(1)}</>}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="flex-1 h-[7px] rounded-full bg-paper-2 overflow-hidden">
                      {/* Fill scales via transform — box width stays constant */}
                      <div className="h-full" style={{ width: `${mod.passRate ?? 0}%` }}>
                        <motion.div
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: 1 }}
                          transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.15 + Math.min(i, 8) * 0.03 }}
                          style={{ transformOrigin: "left" }}
                          className={`h-full w-full rounded-full ${mod.passRate !== null && mod.passRate >= 80 ? "bg-[#5E7D58]" : mod.passRate !== null && mod.passRate >= 50 ? "bg-[#E0A43A]" : "bg-[#B06A4E]"}`}
                        />
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold text-ink-600 w-9 text-right tabular-nums">
                      {mod.passRate === null ? "—" : `${mod.passRate}%`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px] text-ink-300 mt-4">{de ? "Balken = Bestehensquote (letzte 12 Monate)." : "Bar = pass rate (last 12 months)."}</p>
        </div>

        {/* ── Level distribution ── */}
        <div className="card-surface p-5 md:p-6">
          <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-ink-600 mb-5 flex items-center gap-2">
            <ChartBarIcon className="w-4 h-4 text-amber-600" />
            {de ? "Level-Verteilung aktiver Vorlesungen" : "Level distribution of active lectures"}
          </h3>
          <div className="flex items-end gap-2 sm:gap-3 h-36">
            {computed.levelDist.map((count, level) => (
              <div key={level} className="flex-1 flex flex-col items-center justify-end h-full group/bar" title={`Level ${level + 1} (${LEVEL_LABELS[level]}): ${count}`}>
                <span className={`text-[10px] mb-1 tabular-nums transition-colors ${count > 0 ? "text-ink-600 font-semibold group-hover/bar:text-[#A15E03]" : "text-ink-300"}`}>{count}</span>
                {/* Fixed-height slot; the fill scales via transform (never height) */}
                <div className="w-full flex flex-col justify-end" style={{ height: `${Math.max(4, (count / computed.maxLevel) * 100)}%` }}>
                  <motion.div
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.2 + level * 0.03 }}
                    style={{ transformOrigin: "bottom" }}
                    className={`w-full h-full rounded-t-md ${count > 0 ? "bg-gradient-to-t from-amber-600/60 to-amber-300/75 group-hover/bar:from-amber-600/80 group-hover/bar:to-amber-300 transition-colors duration-300" : "bg-paper-2"}`}
                  />
                </div>
                <span className="text-[9px] mt-1.5 text-ink-400">{LEVEL_LABELS[level]}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-ink-300 mt-4">
            {de
              ? "Je weiter rechts, desto langfristiger sitzt der Stoff."
              : "The further right, the more durable the knowledge."}
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
