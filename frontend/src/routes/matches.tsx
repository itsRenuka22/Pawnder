import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, memo } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, PawPrint, Heart, LogOut, Loader2, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Item = Tables<"items">;

interface Match {
  item: Item;
  yesPct: number;
  totalVotes: number;
}

const COMMUNITY_THRESHOLD = 70; // global yes% required to be a "match"

export const Route = createFileRoute("/matches")({
  head: () => ({
    meta: [
      { title: "Pawnder — Your Matches" },
      { name: "description", content: "Pets you loved that the community loves too." },
    ],
  }),
  component: MatchesPage,
});

function MatchesPage() {
  const navigate = useNavigate();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMatches = async () => {
    setLoading(true);
    setError(null);

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) { navigate({ to: "/auth" }); return; }
    const uid = sessionData.session.user.id;

    try {
      // Fetch user's yes votes + global results in parallel
      const [{ data: userVotes, error: votesErr }, { data: items, error: itemsErr }, { data: resultsRaw, error: resultsErr }] =
        await Promise.all([
          supabase.from("votes").select("item_id").eq("user_id", uid).eq("choice", "yes"),
          supabase.from("items").select("*"),
          supabase.from("results").select("item_id, yes_percentage, total_votes"),
        ]);

      if (votesErr) throw votesErr;
      if (itemsErr) throw itemsErr;
      if (resultsErr) throw resultsErr;

      // Build lookup maps
      const userYesIds = new Set((userVotes ?? []).map((v) => v.item_id));
      const itemMap = new Map<string, Item>((items ?? []).map((i) => [i.id, i]));
      const statsMap = new Map<string, { yesPct: number; totalVotes: number }>(
        (resultsRaw ?? []).map((r) => [r.item_id, {
          yesPct: Number(r.yes_percentage ?? 0),
          totalVotes: r.total_votes ?? 0,
        }])
      );

      // A match = user voted yes AND community yes% >= threshold
      const found: Match[] = [];
      userYesIds.forEach((itemId) => {
        const item = itemMap.get(itemId);
        const stats = statsMap.get(itemId);
        if (!item || !stats) return;
        if (stats.yesPct >= COMMUNITY_THRESHOLD) {
          found.push({ item, yesPct: stats.yesPct, totalVotes: stats.totalVotes });
        }
      });

      // Sort by community approval descending
      found.sort((a, b) => b.yesPct - a.yesPct || b.totalVotes - a.totalVotes);
      setMatches(found);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError("Couldn't load matches. Check your connection and try again.");
      if (import.meta.env.DEV) console.error("[matches] load error:", msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadMatches(); }, []);

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
              <Heart className="h-4 w-4 text-primary-foreground fill-current" />
            </div>
            <h1 className="text-lg font-bold text-foreground tracking-tight truncate">Your Matches 💚</h1>
          </div>
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

        {/* ── Loading ── */}
        {loading && <MatchesLoadingSkeleton />}

        {/* ── Error ── */}
        {error && !loading && (
          <div role="alert" className="text-center py-12 px-4">
            <div aria-hidden className="text-4xl mb-3">😿</div>
            <h2 className="text-lg font-bold text-foreground">Couldn't load matches</h2>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            <button
              onClick={loadMatches}
              className="mt-5 min-h-[52px] px-6 rounded-2xl bg-gradient-primary text-primary-foreground font-semibold text-sm shadow-glow active:scale-[0.98] transition"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* ── Subtitle ── */}
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 180, damping: 22 }}
              className="text-sm text-muted-foreground"
            >
              Pets you loved where {COMMUNITY_THRESHOLD}%+ of the community agreed.
            </motion.p>

            {/* ── Empty state ── */}
            {matches.length === 0 && (
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
                <h2 className="text-lg font-bold text-foreground">No matches yet! 🐾</h2>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                  Vote on more pets to find your matches, or check back once more people have voted.
                </p>
                <div className="mt-5 flex flex-col gap-2">
                  <Link
                    to="/swipe"
                    className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-gradient-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition active:scale-[0.98]"
                  >
                    Keep swiping
                  </Link>
                  <Link
                    to="/results"
                    className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-2xl px-5 py-2.5 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
                  >
                    <Trophy className="h-4 w-4" aria-hidden />
                    See community results
                  </Link>
                </div>
              </motion.div>
            )}

            {/* ── Match cards ── */}
            {matches.map((match, i) => (
              <MatchCard
                key={match.item.id}
                match={match}
                rank={i + 1}
                delay={Math.min(i * 0.04, 0.3)}
              />
            ))}
          </>
        )}
      </div>
    </main>
  );
}

// ── Match card ────────────────────────────────────────────────────────────────

const MatchCard = memo(function MatchCard({
  match, rank, delay,
}: {
  match: Match; rank: number; delay: number;
}) {
  const { item, yesPct, totalVotes } = match;
  const [imgErr, setImgErr] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 24, delay }}
      className="bg-card rounded-2xl overflow-hidden shadow-soft"
    >
      {/* Pet image */}
      <div className="relative h-48 w-full bg-muted">
        {!imgErr && item.image_url && (
          <img
            src={item.image_url}
            alt={`${item.name}${item.breed ? `, ${item.breed}` : ""}`}
            onError={() => {
              if (import.meta.env.DEV) console.warn("[matches] image failed:", item.image_url);
              setImgErr(true);
            }}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        )}
        {(imgErr || !item.image_url) && (
          <div className="h-full w-full flex items-center justify-center text-5xl">🐾</div>
        )}
        {/* Gradient overlay with name */}
        <div className="absolute inset-x-0 bottom-0 h-[60%] bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
        <div className="absolute bottom-3 left-3 right-3">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-lg font-extrabold text-white leading-tight drop-shadow">{item.name}</p>
              {item.breed && (
                <p className="text-xs font-medium text-white/80 drop-shadow">{item.breed}</p>
              )}
            </div>
            <span className="flex items-center gap-1 bg-primary/90 backdrop-blur-sm text-primary-foreground text-xs font-bold px-2 py-1 rounded-lg">
              <Heart className="h-3 w-3 fill-current" aria-hidden />
              #{rank}
            </span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="p-3 space-y-2">
        {item.age_label && (
          <p className="text-xs text-muted-foreground">{item.age_label}</p>
        )}
        {item.description && (
          <p className="text-sm text-foreground leading-snug line-clamp-2">{item.description}</p>
        )}
        <div>
          <div className="flex justify-between text-xs font-semibold mb-1">
            <span className="text-primary">{yesPct}% loved by community</span>
            <span className="text-muted-foreground">{totalVotes.toLocaleString()} votes</span>
          </div>
          <div
            role="meter"
            aria-label={`${yesPct}% community approval`}
            aria-valuenow={yesPct}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-2 w-full rounded-full bg-muted overflow-hidden"
          >
            <motion.div
              className="h-full bg-gradient-primary"
              initial={{ width: 0 }}
              animate={{ width: `${yesPct}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 20, delay }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
});

// ── Loading skeleton ──────────────────────────────────────────────────────────

function MatchesLoadingSkeleton() {
  return (
    <div role="status" aria-label="Loading matches" className="space-y-4">
      <div className="h-4 w-64 rounded bg-muted animate-pulse" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="bg-card rounded-2xl overflow-hidden shadow-soft">
          <div className="h-48 w-full bg-muted animate-pulse" />
          <div className="p-3 space-y-2">
            <div className="h-3 w-20 rounded bg-muted animate-pulse" />
            <div className="h-4 w-full rounded bg-muted animate-pulse" />
            <div className="h-2 w-full rounded-full bg-muted animate-pulse" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading matches…</span>
    </div>
  );
}
