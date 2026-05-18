import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, PawPrint, Heart, Home, BarChart2, LogOut, Loader2, Timer, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Item = Tables<"items">;

interface Row {
  item: Item;
  yes: number;
  no: number;
  total: number;
  yesPct: number; // 0–100, from results view
}

type SortMode = "loved" | "divisive" | "voted";


export const Route = createFileRoute("/results")({
  head: () => ({
    meta: [
      { title: "Pawnder — Results" },
      { name: "description", content: "See which pets the community fell in love with." },
    ],
  }),
  component: ResultsPage,
});

function ResultsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>("loved");
  const [isLive, setIsLive] = useState(false);
  const [activeSessions, setActiveSessions] = useState<number | null>(null);
  const [avgDecisionSec, setAvgDecisionSec] = useState<number | null>(null);
  // Debounce realtime refetches to at most 1 per 2s
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadResults = async () => {
    setLoading(true);
    setError(null);

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) { navigate({ to: "/auth" }); return; }

    try {
      // results view aggregates ALL users' votes — no user_id filter
      const [{ data: items, error: itemsErr }, { data: resultsRaw, error: resultsErr }] =
        await Promise.all([
          supabase.from("items").select("*"),
          supabase.from("results").select("item_id, yes_count, no_count, total_votes, yes_percentage"),
        ]);

      if (itemsErr) throw itemsErr;
      if (resultsErr) throw resultsErr;

      // Build item_id → stats lookup
      const statsMap = new Map<string, { yes: number; no: number; total: number; yesPct: number }>();
      (resultsRaw ?? []).forEach((r) => {
        statsMap.set(r.item_id, {
          yes:    r.yes_count    ?? 0,
          no:     r.no_count     ?? 0,
          total:  r.total_votes  ?? 0,
          yesPct: Number(r.yes_percentage ?? 0),
        });
      });

      // Merge items with global stats; 0-vote pets get zero stats
      const merged: Row[] = (items ?? []).map((item) => {
        const s = statsMap.get(item.id) ?? { yes: 0, no: 0, total: 0, yesPct: 0 };
        return { item, ...s };
      });

      setRows(merged);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError("Couldn't load results. Check your connection and try again.");
      if (import.meta.env.DEV) console.error("[results] load error:", msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadResults(); }, [navigate]);

  // Analytics: global stats from analytics view + avg decision time (localStorage)
  useEffect(() => {
    async function fetchAnalytics() {
      // analytics view bypasses RLS (GRANT SELECT to authenticated) and
      // aggregates across all users — no per-user filter applied.
      const { data } = await supabase
        .from("analytics")
        .select("active_voters_24h")
        .single();
      setActiveSessions(data?.active_voters_24h ?? 0);

      // Read decision times this user recorded locally
      try {
        const raw = localStorage.getItem("pawnder_decision_times");
        const times: number[] = raw ? JSON.parse(raw) : [];
        if (times.length > 0) {
          const avg = times.reduce((a, b) => a + b, 0) / times.length / 1000;
          setAvgDecisionSec(avg);
        }
      } catch {
        // localStorage unavailable — leave null
      }
    }
    void fetchAnalytics();
  }, []);

  // Stretch goal #10 — real-time results via Supabase Realtime
  useEffect(() => {
    const channel = supabase
      .channel("votes-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "votes" },
        () => {
          // Debounce: coalesce rapid inserts into a single refetch
          if (refetchTimer.current) clearTimeout(refetchTimer.current);
          refetchTimer.current = setTimeout(() => { void loadResults(); }, 2000);
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "votes" },
        () => {
          if (refetchTimer.current) clearTimeout(refetchTimer.current);
          refetchTimer.current = setTimeout(() => { void loadResults(); }, 2000);
        }
      )
      .subscribe((status) => {
        setIsLive(status === "SUBSCRIBED");
      });

    return () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      void supabase.removeChannel(channel);
    };
  }, []);

  // Sorting — 0-vote pets always sink to the bottom
  const sorted = [...rows].sort((a, b) => {
    if (a.total === 0 && b.total === 0) return 0;
    if (a.total === 0) return 1;
    if (b.total === 0) return -1;

    if (sort === "loved") {
      if (b.yesPct !== a.yesPct) return b.yesPct - a.yesPct;
      return b.total - a.total;
    }
    if (sort === "divisive") {
      const distA = Math.abs(a.yesPct - 50);
      const distB = Math.abs(b.yesPct - 50);
      if (distA !== distB) return distA - distB;
      return b.total - a.total;
    }
    // "voted"
    if (b.total !== a.total) return b.total - a.total;
    return b.yesPct - a.yesPct;
  });

  const petsWithVotes = rows.filter((r) => r.total > 0).length;
  const globalTotalYes = rows.reduce((s, r) => s + r.yes, 0);
  const globalTotalVotes = rows.reduce((s, r) => s + r.total, 0);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <main className="min-h-[100dvh] bg-gradient-warm overflow-x-hidden">

      {/* ── Header ── */}
      <header className="sticky top-0 z-20 bg-background/70 backdrop-blur-md px-5 pt-4 pb-3 border-b border-border/50">
        <div className="flex items-center gap-3">
          <Link
            to="/swipe"
            aria-label="Back to swipe"
            className="h-10 w-10 min-w-[44px] rounded-full bg-card flex items-center justify-center shadow-soft hover:bg-muted transition flex-shrink-0"
          >
            <ArrowLeft className="h-5 w-5 text-foreground" aria-hidden />
          </Link>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div
              aria-hidden
              className="h-7 w-7 rounded-full bg-gradient-primary flex items-center justify-center shadow-glow flex-shrink-0"
            >
              <PawPrint className="h-4 w-4 text-primary-foreground" />
            </div>
            <h1 className="text-lg font-bold text-foreground tracking-tight truncate">Community Picks</h1>
            {isLive && (
              <span
                aria-label="Live results"
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/15 text-destructive text-[10px] font-bold tracking-wide uppercase flex-shrink-0"
              >
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
                Live
              </span>
            )}
          </div>
          <Link
            to="/matches"
            aria-label="View your matches"
            className="h-10 px-3 rounded-full bg-card text-foreground text-sm font-semibold flex items-center gap-1.5 shadow-soft hover:bg-muted transition flex-shrink-0"
          >
            <Heart className="h-4 w-4 text-primary fill-current" aria-hidden />
            <span className="hidden sm:inline">Matches</span>
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Sign out"
            className="h-10 w-10 min-w-[44px] rounded-full bg-card flex items-center justify-center shadow-soft hover:bg-muted transition flex-shrink-0"
          >
            <LogOut className="h-4 w-4 text-muted-foreground" aria-hidden />
          </button>
        </div>
      </header>

      <div className="px-5 py-5 max-w-md mx-auto space-y-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">

        {/* ── Loading skeleton ── */}
        {loading && <ResultsLoadingSkeleton />}

        {/* ── Error state ── */}
        {error && !loading && (
          <div role="alert" className="text-center py-12 px-4">
            <div aria-hidden className="text-4xl mb-3">😿</div>
            <h2 className="text-lg font-bold text-foreground">Couldn't load results</h2>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            <button
              onClick={loadResults}
              className="mt-5 min-h-[52px] px-6 rounded-2xl bg-gradient-primary text-primary-foreground font-semibold text-sm shadow-glow active:scale-[0.98] transition"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* ── Summary stat cards ── */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 180, damping: 22 }}
              className="grid grid-cols-2 gap-3"
            >
              <div className="bg-card rounded-2xl p-4 shadow-soft flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <Heart className="h-4 w-4 text-primary fill-current" aria-hidden />
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Yes votes</span>
                </div>
                <span className="text-2xl font-extrabold text-foreground">{globalTotalYes.toLocaleString()}</span>
                <span className="text-xs text-muted-foreground">across all users</span>
              </div>
              <div className="bg-card rounded-2xl p-4 shadow-soft flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <BarChart2 className="h-4 w-4 text-primary" aria-hidden />
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total votes</span>
                </div>
                <span className="text-2xl font-extrabold text-foreground">{globalTotalVotes.toLocaleString()}</span>
                <span className="text-xs text-muted-foreground">{petsWithVotes} of {rows.length} pets</span>
              </div>
              <div className="bg-card rounded-2xl p-4 shadow-soft flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-primary" aria-hidden />
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Active voters</span>
                </div>
                <span className="text-2xl font-extrabold text-foreground">
                  {activeSessions === null ? "…" : activeSessions}
                </span>
                <span className="text-xs text-muted-foreground">last 24 hours</span>
              </div>
              <div className="bg-card rounded-2xl p-4 shadow-soft flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <Timer className="h-4 w-4 text-primary" aria-hidden />
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Avg decision</span>
                </div>
                <span className="text-2xl font-extrabold text-foreground">
                  {avgDecisionSec === null ? "N/A" : `${avgDecisionSec.toFixed(1)}s`}
                </span>
                <span className="text-xs text-muted-foreground">your swipe speed</span>
              </div>
            </motion.div>

            {/* ── Sort toggle ── */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 180, damping: 22, delay: 0.05 }}
              role="group"
              aria-label="Sort order"
              className="relative grid grid-cols-3 rounded-full bg-card p-1 shadow-soft text-sm font-semibold"
            >
              <motion.span
                aria-hidden
                className="absolute inset-y-1 w-[calc(33.33%-0.2rem)] rounded-full bg-gradient-primary shadow-glow"
                animate={{ x: sort === "loved" ? "0%" : sort === "divisive" ? "100%" : "200%" }}
                transition={{ type: "spring", stiffness: 300, damping: 28 }}
              />
              {(["loved", "divisive", "voted"] as SortMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={sort === m}
                  onClick={() => setSort(m)}
                  className={`relative z-10 py-2.5 min-h-[44px] rounded-full transition-colors text-center text-xs sm:text-sm ${
                    sort === m ? "text-primary-foreground" : "text-muted-foreground"
                  }`}
                >
                  {m === "loved" ? "❤️ Loved" : m === "divisive" ? "⚖️ Split" : "📊 Voted"}
                </button>
              ))}
            </motion.div>

            {/* ── Empty state ── */}
            {petsWithVotes === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-16 px-4"
              >
                <div
                  aria-hidden
                  className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-card shadow-soft animate-float"
                >
                  <PawPrint className="h-8 w-8 text-primary" strokeWidth={2.4} />
                </div>
                <h2 className="text-lg font-bold text-foreground">No votes yet! 🐾</h2>
                <p className="mt-1 text-sm text-muted-foreground">Be the first to vote on some pets!</p>
                <Link
                  to="/swipe"
                  className="mt-5 inline-flex min-h-[52px] items-center gap-2 rounded-2xl bg-gradient-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition active:scale-[0.98]"
                >
                  Start swiping
                </Link>
              </motion.div>
            )}

            {/* ── Pet list ── */}
            <AnimatePresence mode="popLayout">
              {sorted.map(({ item, yes, no, total, yesPct }, i) => (
                <PetResultRow
                  key={item.id}
                  item={item}
                  yes={yes}
                  no={no}
                  total={total}
                  yesPct={yesPct}
                  rank={i + 1}
                  delay={Math.min(i * 0.025, 0.25)}
                />
              ))}
            </AnimatePresence>
          </>
        )}
      </div>
    </main>
  );
}

// ── Pet result row (memoised to avoid re-renders on sort toggle) ──────────────

const PetResultRow = memo(function PetResultRow({
  item, yes, no, total, yesPct, rank, delay,
}: {
  item: Item; yes: number; no: number; total: number; yesPct: number; rank: number; delay: number;
}) {
  const [imgErr, setImgErr] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 200, damping: 24, delay }}
      className={`bg-card rounded-2xl p-3 shadow-soft ${total === 0 ? "opacity-50" : ""}`}
    >
      <div className="flex items-center gap-3">
        {/* Rank */}
        <span
          aria-label={`Rank ${rank}`}
          className="w-6 text-center text-xs font-bold text-muted-foreground flex-shrink-0 tabular-nums"
        >
          {rank}
        </span>

        {/* Thumbnail */}
        <img
          src={imgErr || !item.image_url ? "" : item.image_url}
          alt={`${item.name}${item.breed ? `, ${item.breed}` : ""}`}
          onError={() => {
            if (import.meta.env.DEV) console.warn("[results] image failed:", item.image_url);
            setImgErr(true);
          }}
          loading="lazy"
          className="h-14 w-14 rounded-xl object-cover bg-muted flex-shrink-0"
        />

        {/* Info + bar */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-bold text-foreground text-sm leading-tight truncate">{item.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {item.breed ?? "Unknown breed"}
              </p>
            </div>
            {/* Vote count badges */}
            <div className="flex gap-1.5 flex-shrink-0" aria-label={`${yes} yes, ${no} no`}>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold">
                <Heart className="h-3 w-3 fill-current" aria-hidden />{yes}
              </span>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-destructive/10 text-destructive text-xs font-semibold">
                <Home className="h-3 w-3" aria-hidden />{no}
              </span>
            </div>
          </div>

          {/* Split bar */}
          {total > 0 ? (
            <div>
              <div
                role="meter"
                aria-label={`${yesPct}% yes votes`}
                aria-valuenow={yesPct}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-2 w-full rounded-full bg-muted overflow-hidden flex"
              >
                <motion.div
                  aria-hidden
                  className="h-full bg-gradient-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${yesPct}%` }}
                  transition={{ type: "spring", stiffness: 120, damping: 20, delay }}
                />
                <motion.div
                  aria-hidden
                  className="h-full bg-destructive/50"
                  initial={{ width: 0 }}
                  animate={{ width: `${100 - yesPct}%` }}
                  transition={{ type: "spring", stiffness: 120, damping: 20, delay }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground font-medium mt-0.5">
                <span>{yesPct}% loved</span>
                <span>{total.toLocaleString()} vote{total !== 1 ? "s" : ""}</span>
              </div>
            </div>
          ) : (
            <div className="space-y-0.5">
              <div className="h-2 w-full rounded-full bg-muted" />
              <p className="text-[10px] text-muted-foreground">No votes yet</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
});

// ── Results loading skeleton ──────────────────────────────────────────────────

function ResultsLoadingSkeleton() {
  return (
    <div role="status" aria-label="Loading results" className="space-y-4">
      {/* Stat cards skeleton */}
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-card rounded-2xl p-4 shadow-soft space-y-2">
            <div className="h-3 w-16 rounded bg-muted animate-pulse" />
            <div className="h-7 w-12 rounded bg-muted animate-pulse" />
            <div className="h-3 w-20 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
      {/* Sort toggle skeleton */}
      <div className="h-12 w-full rounded-full bg-card shadow-soft animate-pulse" />
      {/* Row skeletons */}
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-card rounded-2xl p-3 shadow-soft flex items-center gap-3">
          <div className="w-6 h-4 rounded bg-muted animate-pulse flex-shrink-0" />
          <div className="h-14 w-14 rounded-xl bg-muted animate-pulse flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-28 rounded bg-muted animate-pulse" />
            <div className="h-3 w-20 rounded bg-muted animate-pulse" />
            <div className="h-2 w-full rounded-full bg-muted animate-pulse" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading results…</span>
    </div>
  );
}
