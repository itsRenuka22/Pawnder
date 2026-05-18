import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback, memo } from "react";
import TinderCard from "react-tinder-card";
import { motion, AnimatePresence } from "framer-motion";
import { PawPrint, Trophy, Loader2, LogOut, Undo2, Heart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Item = Tables<"items">;
type SwipeDir = "left" | "right" | "up" | "down";

interface LastVote {
  voteId: string;
  item: Item;
  choice: "yes" | "no";
}

export const Route = createFileRoute("/swipe")({
  head: () => ({
    meta: [
      { title: "Pawnder — Swipe" },
      { name: "description", content: "Swipe through adoptable pets on Pawnder." },
    ],
  }),
  component: SwipePage,
});

const DECISION_TIMES_KEY = "pawnder_decision_times";
const MAX_STORED_TIMES = 100;
const SLOW_SWIPE_CAP_MS = 30_000;

function recordDecisionTime(ms: number) {
  const capped = Math.min(ms, SLOW_SWIPE_CAP_MS);
  try {
    const raw = localStorage.getItem(DECISION_TIMES_KEY);
    const times: number[] = raw ? JSON.parse(raw) : [];
    times.push(capped);
    if (times.length > MAX_STORED_TIMES) times.shift();
    localStorage.setItem(DECISION_TIMES_KEY, JSON.stringify(times));
  } catch {
    // localStorage unavailable — silently skip
  }
}

const PLACEHOLDER =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 350 500'><rect width='100%' height='100%' fill='%23f5d4c4'/><text x='50%' y='50%' font-size='64' text-anchor='middle' dominant-baseline='middle' fill='%23b07a5e'>🐾</text></svg>";

function SwipePage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [votedCount, setVotedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [lastDir, setLastDir] = useState<"left" | "right" | null>(null);
  const [lastVote, setLastVote] = useState<LastVote | null>(null);
  const [undoing, setUndoing] = useState(false);
  // Debounce: prevent recording a vote while the previous one is in flight
  const votingInFlight = useRef(false);
  const cardShownAt = useRef<number>(Date.now());
  const lastDirTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // One stable ref per card — enables programmatic swipe from the buttons
  const childRefs = useMemo<Array<React.RefObject<any>>>(
    () => Array.from({ length: items.length }, () => ({ current: null }) as React.RefObject<any>),
    [items.length]
  );

  const loadPets = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) { navigate({ to: "/auth" }); return; }
    const uid = sessionData.session.user.id;
    setUserId(uid);

    try {
      const [{ data: allItems, error: itemsErr }, { data: votes, error: votesErr }] =
        await Promise.all([
          supabase.from("items").select("*"),
          supabase.from("votes").select("item_id").eq("user_id", uid),
        ]);
      if (itemsErr) throw itemsErr;
      if (votesErr) throw votesErr;

      const votedIds = new Set((votes ?? []).map((v) => v.item_id));
      const remaining = (allItems ?? []).filter((i) => !votedIds.has(i.id));
      // Fisher-Yates shuffle so each user sees pets in a different order
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
      }
      // Reverse: index 0 = bottom of visual stack, currentIndex = top card
      const reversed = [...remaining].reverse();
      setTotalCount(allItems?.length ?? 0);
      setVotedCount(votedIds.size);
      setItems(reversed);
      setCurrentIndex(reversed.length - 1);
      setLastVote(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load pets";
      setError("Couldn't load pets. Check your connection and try again.");
      if (import.meta.env.DEV) console.error("[swipe] load error:", msg);
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;
    loadPets().then(() => { if (cancelled) return; });
    return () => { cancelled = true; };
  }, [loadPets]);

  const flashDir = useCallback((dir: "left" | "right") => {
    setLastDir(dir);
    if (lastDirTimeout.current) clearTimeout(lastDirTimeout.current);
    lastDirTimeout.current = setTimeout(() => setLastDir(null), 500);
  }, []);

  const recordVote = useCallback(async (item: Item, choice: "yes" | "no") => {
    if (!userId || votingInFlight.current) return;
    votingInFlight.current = true;
    try {
      const { data, error } = await supabase
        .from("votes")
        .insert({ item_id: item.id, user_id: userId, choice })
        .select("id")
        .single();

      if (error) {
        // 23505 = unique_violation: user already voted on this item (not an error — just skip)
        if (error.code === "23505") return;

        // Transient error: retry once before giving up
        const { data: retryData, error: retryErr } = await supabase
          .from("votes")
          .insert({ item_id: item.id, user_id: userId, choice })
          .select("id")
          .single();
        if (retryErr) {
          if (import.meta.env.DEV) console.error("[swipe] vote failed after retry:", retryErr.message);
          // Don't increment counter — vote wasn't persisted
          return;
        }
        // Retry succeeded
        if (retryData?.id) {
          setLastVote({ voteId: retryData.id, item, choice });
        }
        setVotedCount((c) => c + 1);
        return;
      }

      // Only count the vote once it's confirmed persisted
      if (data?.id) {
        setLastVote({ voteId: data.id, item, choice });
      }
      setVotedCount((c) => c + 1);
    } finally {
      votingInFlight.current = false;
    }
  }, [userId]);

  const handleUndo = useCallback(async () => {
    if (!lastVote || undoing || votingInFlight.current) return;
    setUndoing(true);
    try {
      const { error } = await supabase
        .from("votes")
        .delete()
        .eq("id", lastVote.voteId);

      if (error) {
        if (import.meta.env.DEV) console.error("[swipe] undo failed:", error.message);
        return;
      }

      // Restore the card to the top of the deck
      setItems((prev) => {
        const next = [...prev, lastVote.item];
        return next;
      });
      setCurrentIndex((i) => i + 1);
      setVotedCount((c) => Math.max(0, c - 1));
      setLastVote(null);
    } finally {
      setUndoing(false);
    }
  }, [lastVote, undoing]);

  const onSwiped = useCallback((dir: SwipeDir, item: Item, index: number) => {
    recordDecisionTime(Date.now() - cardShownAt.current);
    cardShownAt.current = Date.now(); // reset for next card
    setCurrentIndex(index - 1);
    if (dir === "right") { flashDir("right"); void recordVote(item, "yes"); }
    else if (dir === "left") { flashDir("left"); void recordVote(item, "no"); }
  }, [recordVote, flashDir]);

  const swipe = useCallback(async (dir: "left" | "right") => {
    if (currentIndex < 0) return;
    const ref = childRefs[currentIndex];
    if (ref?.current?.swipe) await ref.current.swipe(dir);
  }, [currentIndex, childRefs]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  const total = Math.max(totalCount, 1);
  const pct = Math.min(100, Math.round((votedCount / total) * 100));
  const deckEmpty = !loading && !error && currentIndex < 0;
  const hasCards = !loading && !error && !deckEmpty;

  return (
    <main className="min-h-[100dvh] bg-gradient-warm flex flex-col select-none overflow-hidden">

      {/* ── Header ── */}
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border/50">
        {/* Row 1: Logo + sign-out */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <div
              aria-hidden
              className="h-9 w-9 rounded-full bg-gradient-primary flex items-center justify-center shadow-glow animate-float flex-shrink-0"
            >
              <PawPrint className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold text-foreground tracking-tight">Pawnder</span>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Sign out"
            className="h-9 w-9 min-w-[44px] rounded-full bg-card flex items-center justify-center shadow-soft hover:bg-muted transition flex-shrink-0"
          >
            <LogOut className="h-4 w-4 text-muted-foreground" aria-hidden />
          </button>
        </div>

        {/* Row 2: Progress */}
        <div className="px-5 pb-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground">
              {loading ? "Loading…" : `${votedCount} of ${totalCount} pets`}
            </span>
            <span className="text-xs font-semibold text-foreground tabular-nums">{pct}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Voting progress"
            className="h-1.5 w-full rounded-full bg-muted overflow-hidden"
          >
            <motion.div
              className="h-full bg-gradient-primary rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 20 }}
            />
          </div>
        </div>

        {/* Row 3: Navigation tabs */}
        <div className="flex gap-2 px-5 pb-3">
          <Link
            to="/matches"
            aria-label="View your matches"
            className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 rounded-full bg-card text-foreground text-sm font-semibold shadow-soft hover:bg-muted transition"
          >
            <Heart className="h-4 w-4 text-primary fill-current" aria-hidden />
            Matches
          </Link>
          <Link
            to="/results"
            aria-label="View results"
            className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 rounded-full bg-card text-foreground text-sm font-semibold shadow-soft hover:bg-muted transition"
          >
            <Trophy className="h-4 w-4 text-primary" aria-hidden />
            Results
          </Link>
        </div>
      </header>

      {/* ── Card area ── */}
      <section className="flex-1 flex items-center justify-center px-5 py-6 relative">
        {loading && <SwipeLoadingSkeleton />}
        {error && !loading && (
          <ErrorState
            message={error}
            onRetry={loadPets}
          />
        )}
        {deckEmpty && <EmptyDeck onResults={() => navigate({ to: "/results" })} />}

        {hasCards && (
          <div className="relative w-full max-w-[340px]" style={{ aspectRatio: "7/10" }}>
            {/* Swipe direction tint flash */}
            <AnimatePresence>
              {lastDir === "right" && (
                <motion.div
                  key="yes-flash"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  aria-hidden
                  className="absolute inset-0 z-30 rounded-3xl pointer-events-none"
                  style={{ background: "linear-gradient(135deg, oklch(0.72 0.22 145 / 0.4), transparent 65%)" }}
                />
              )}
              {lastDir === "left" && (
                <motion.div
                  key="no-flash"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  aria-hidden
                  className="absolute inset-0 z-30 rounded-3xl pointer-events-none"
                  style={{ background: "linear-gradient(225deg, oklch(0.6 0.22 25 / 0.4), transparent 65%)" }}
                />
              )}
            </AnimatePresence>

            {items.map((item, index) => {
              if (index > currentIndex) return null;
              const stackPos = currentIndex - index;
              if (stackPos > 2) return null;
              return (
                <TinderCard
                  ref={childRefs[index]}
                  key={item.id}
                  onSwipe={(dir: SwipeDir) => onSwiped(dir, item, index)}
                  preventSwipe={["up", "down"]}
                  swipeRequirementType="position"
                  swipeThreshold={80}
                  className="absolute inset-0"
                >
                  <PetCard item={item} stackPos={stackPos} />
                </TinderCard>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Bottom action bar ── */}
      <AnimatePresence>
        {hasCards && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 200, damping: 24 }}
            className="px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2 flex flex-col items-center gap-2"
          >
            <div className="flex items-center justify-center gap-4 w-full">
              <button
                type="button"
                onClick={() => swipe("left")}
                aria-label="Nope, pass on this pet"
                className="flex-1 max-w-[160px] min-h-[52px] rounded-full bg-card text-foreground text-sm font-bold shadow-soft hover:bg-muted transition active:scale-95 border border-border"
              >
                🙈 Nope, Fur Now
              </button>

              <button
                type="button"
                onClick={() => swipe("right")}
                aria-label="Pawwfect, like this pet"
                className="flex-1 max-w-[160px] min-h-[52px] rounded-full bg-gradient-primary text-primary-foreground text-sm font-bold shadow-glow hover:opacity-90 transition active:scale-95"
              >
                🥰 Pawwfect
              </button>
            </div>

            {/* Undo last swipe */}
            <button
              type="button"
              onClick={handleUndo}
              disabled={!lastVote || undoing}
              aria-label="Undo last swipe"
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold text-muted-foreground transition hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {undoing
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                : <Undo2 className="h-3.5 w-3.5" aria-hidden />
              }
              Undo
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

// ── Pet card ──────────────────────────────────────────────────────────────────

const PetCard = memo(function PetCard({ item, stackPos }: { item: Item; stackPos: number }) {
  const [imgErr, setImgErr] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const isTop = stackPos === 0;
  const src = imgErr || !item.image_url ? PLACEHOLDER : item.image_url;

  const handleImgError = () => {
    if (import.meta.env.DEV) console.warn("[swipe] image failed to load:", item.image_url);
    setImgErr(true);
  };

  return (
    <motion.div
      animate={{
        scale: 1 - stackPos * 0.04,
        y: stackPos * 12,
        opacity: stackPos > 1 ? 0.7 : 1,
      }}
      transition={{ type: "spring", stiffness: 200, damping: 22 }}
      className="relative h-full w-full rounded-3xl overflow-hidden bg-card shadow-card"
      style={{ zIndex: 10 - stackPos }}
    >
      {/* Shimmer placeholder shown while image loads */}
      {!imgLoaded && (
        <div
          aria-hidden
          className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted via-accent/20 to-muted"
        />
      )}

      <img
        src={src}
        alt={`Photo of ${item.name}${item.breed ? `, a ${item.breed}` : ""}`}
        draggable={false}
        onError={handleImgError}
        onLoad={() => setImgLoaded(true)}
        loading={isTop ? "eager" : "lazy"}
        className={`absolute inset-0 h-full w-full object-cover pointer-events-none transition-opacity duration-300 ${
          imgLoaded ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Gradient overlay */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none"
      />

      {/* Pet info */}
      <div className="absolute inset-x-0 bottom-0 p-5 pointer-events-none">
        <div className="flex items-end gap-2 flex-wrap">
          <h2 className="text-3xl font-extrabold text-white leading-tight drop-shadow">
            {item.name}
          </h2>
          {item.age_label && (
            <span className="pb-0.5 text-base font-medium text-white/90 drop-shadow">
              · {item.age_label}
            </span>
          )}
        </div>
        {item.breed && (
          <p className="mt-1 text-sm font-semibold text-white/90 drop-shadow">{item.breed}</p>
        )}
        {item.description && (
          <p className="mt-2 text-sm text-white/80 leading-snug line-clamp-2 drop-shadow">
            {item.description}
          </p>
        )}
      </div>

      {/* Swipe hint labels — top card only */}
      {isTop && (
        <div aria-hidden className="absolute top-4 left-4 right-4 flex justify-between pointer-events-none">
          <span className="rounded-xl bg-black/30 backdrop-blur-sm px-3 py-1 text-xs font-bold text-white/70 tracking-wide uppercase">
            ← Pass
          </span>
          <span className="rounded-xl bg-black/30 backdrop-blur-sm px-3 py-1 text-xs font-bold text-white/70 tracking-wide uppercase">
            Like →
          </span>
        </div>
      )}
    </motion.div>
  );
});

// ── Skeleton loader ───────────────────────────────────────────────────────────

function SwipeLoadingSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading pets"
      className="relative w-full max-w-[340px] rounded-3xl bg-card/60 overflow-hidden shadow-card"
      style={{ aspectRatio: "7/10" }}
    >
      {/* Shimmer sweep */}
      <div aria-hidden className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted via-accent/10 to-muted" />
      {/* Skeleton text lines at bottom */}
      <div aria-hidden className="absolute inset-x-0 bottom-0 p-5 space-y-2.5">
        <div className="h-8 w-40 rounded-xl bg-muted/70 animate-pulse" />
        <div className="h-4 w-24 rounded-xl bg-muted/50 animate-pulse" />
        <div className="h-4 w-52 rounded-xl bg-muted/40 animate-pulse" />
      </div>
      <Loader2 aria-hidden className="absolute inset-0 m-auto h-10 w-10 text-primary animate-spin" />
      <span className="sr-only">Loading pets…</span>
    </div>
  );
}

// ── Error state ───────────────────────────────────────────────────────────────

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="text-center px-6 max-w-xs">
      <div aria-hidden className="text-5xl mb-4">😿</div>
      <h2 className="text-lg font-bold text-foreground">Couldn't load pets</h2>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      <button
        onClick={onRetry}
        className="mt-6 min-h-[52px] px-6 rounded-2xl bg-gradient-primary text-primary-foreground font-semibold text-sm shadow-glow active:scale-[0.98] transition"
      >
        Try again
      </button>
    </div>
  );
}

// ── Empty deck ────────────────────────────────────────────────────────────────

function EmptyDeck({ onResults }: { onResults: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 180, damping: 22 }}
      className="text-center px-6 max-w-xs"
    >
      <div
        aria-hidden
        className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-card shadow-soft animate-float"
      >
        <PawPrint className="h-10 w-10 text-primary" strokeWidth={2.4} />
      </div>
      <h2 className="text-2xl font-extrabold text-foreground tracking-tight">
        You've voted on everyone! 🎉
      </h2>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
        Every paw has been judged. See how they ranked!
      </p>
      <button
        onClick={onResults}
        className="mt-6 flex w-full min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-gradient-primary px-4 py-3.5 text-base font-semibold text-primary-foreground shadow-glow transition active:scale-[0.98]"
      >
        <Trophy className="h-5 w-5" aria-hidden />
        See Results →
      </button>
    </motion.div>
  );
}
