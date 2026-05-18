import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { PawPrint, Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Pawnder — Sign in" },
      { name: "description", content: "Tinder for Paws. Sign in to start matching with adoptable pets." },
    ],
  }),
  component: AuthScreen,
});

const schema = z.object({
  email: z.string().trim().email("Please enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});

// Map Supabase error messages → friendly copy
function friendlyAuthError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid credentials") || m.includes("invalid email or password"))
    return "Invalid email or password. Please try again.";
  if (m.includes("already registered") || m.includes("user already exists") || m.includes("email address is already"))
    return "That email is already in use. Try logging in instead.";
  if (m.includes("weak password") || m.includes("should be at least") || m.includes("password is known"))
    return "Password is too weak. Try mixing letters, numbers, and symbols.";
  if (m.includes("email not confirmed"))
    return "Please confirm your email before logging in.";
  if (m.includes("network") || m.includes("fetch"))
    return "Network error. Check your connection and try again.";
  return "Something went wrong. Please try again.";
}

function AuthScreen() {
  const navigate = useNavigate();
  const emailRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionChecking, setSessionChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        navigate({ to: "/swipe" });
      } else {
        setSessionChecking(false);
        // Focus after the session check resolves so it doesn't interfere with redirect
        setTimeout(() => emailRef.current?.focus(), 50);
      }
    });
  }, [navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);
    try {
      if (mode === "signup") {
        const { error: authError } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: { emailRedirectTo: `${window.location.origin}/swipe` },
        });
        if (authError) { setError(friendlyAuthError(authError.message)); return; }
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (authError) { setError(friendlyAuthError(authError.message)); return; }
      }
      navigate({ to: "/swipe" });
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  // Blank screen while checking for existing session (avoids flash of auth UI)
  if (sessionChecking) {
    return (
      <main className="min-h-screen bg-gradient-warm flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </main>
    );
  }

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-gradient-warm flex items-center justify-center px-6 py-10">
      {/* Decorative blobs */}
      <div aria-hidden className="pointer-events-none absolute -top-24 -left-20 h-72 w-72 rounded-full bg-primary/30 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-accent/40 blur-3xl" />

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center text-center">
          <div
            aria-hidden
            className="flex h-20 w-20 items-center justify-center rounded-3xl bg-card shadow-soft animate-float"
          >
            <PawPrint className="h-10 w-10 text-primary" strokeWidth={2.4} />
          </div>
          <h1 className="mt-5 text-4xl font-bold tracking-tight text-foreground">Pawnder</h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">Tinder for Paws 🐾</p>
        </div>

        {/* Card */}
        <div className="mt-7 rounded-3xl bg-card/90 backdrop-blur p-6 shadow-card">
          {/* Mode toggle */}
          <div
            role="tablist"
            aria-label="Authentication mode"
            className="relative grid grid-cols-2 rounded-full bg-muted p-1 text-sm font-semibold"
          >
            <span
              aria-hidden
              className="absolute inset-y-1 w-[calc(50%-0.25rem)] rounded-full bg-primary shadow-soft transition-transform duration-300 ease-out"
              style={{ transform: mode === "login" ? "translateX(0)" : "translateX(100%)" }}
            />
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => { setMode(m); setError(null); }}
                className={`relative z-10 rounded-full py-2.5 transition-colors min-h-[44px] ${
                  mode === m ? "text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {m === "login" ? "Log In" : "Sign Up"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-3" noValidate>
            <div>
              <label htmlFor="email" className="sr-only">Email address</label>
              <input
                ref={emailRef}
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@pawmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                aria-describedby={error ? "auth-error" : undefined}
                className="w-full rounded-2xl border border-border bg-background px-4 py-3.5 text-base text-foreground shadow-soft outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">Password</label>
              <input
                id="password"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                placeholder="Password (6+ characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                aria-describedby={error ? "auth-error" : undefined}
                className="w-full rounded-2xl border border-border bg-background px-4 py-3.5 text-base text-foreground shadow-soft outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
              />
            </div>

            {error && (
              <p
                id="auth-error"
                role="alert"
                className="rounded-xl bg-destructive/10 px-3 py-2.5 text-sm font-medium text-destructive"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-gradient-primary px-4 py-3.5 text-base font-semibold text-primary-foreground shadow-glow transition active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  <span>Please wait…</span>
                </>
              ) : mode === "login" ? "Log In" : "Create Account"}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            By continuing you agree to fetch unlimited belly rubs. 🐾
          </p>
        </div>
      </div>
    </main>
  );
}
