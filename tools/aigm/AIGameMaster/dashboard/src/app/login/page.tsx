"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Already authenticated — redirect to dashboard
  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [status, router]);

  const handleDiscordLogin = () => {
    setLoading(true);
    signIn("discord", { callbackUrl: "/dashboard" });
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid password");
      setLoading(false);
    } else {
      router.push("/dashboard");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#0d0d12]">
      {/* Background effects */}
      <div className="fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(34,211,238,0.06),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_120%,rgba(239,68,68,0.03),transparent)]" />
      </div>

      <div
        className={`relative z-10 w-full max-w-[400px] px-6 transition-all duration-500 ${
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
        }`}
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 mb-4 rounded-xl bg-gradient-to-b from-[#1a1a2e] to-[#12121c] border border-[#2a2a3e] shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.05)]">
            <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7 text-[#22d3ee]" stroke="currentColor" strokeWidth={1.5}>
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1 className="text-[20px] font-semibold text-white" style={{ fontFamily: "'Inter', sans-serif" }}>
            Arma Reforger Servers
          </h1>
          <p className="text-[13px] text-[#6b6b80] mt-1">
            by Gaz
          </p>
        </div>

        {/* Login Card */}
        <div className="rounded-xl bg-[#141420] border border-[#232336] shadow-[0_16px_64px_rgba(0,0,0,0.5),0_2px_8px_rgba(0,0,0,0.3)]">
          <div className="px-7 pt-7 pb-1">
            <h2 className="text-[11px] font-semibold uppercase tracking-[2.5px] text-[#55556a]">
              Login
            </h2>
          </div>

          <div className="px-7 pb-7 pt-4">
            <form onSubmit={handlePasswordLogin} className="space-y-5">
              {/* Discord */}
              <button
                type="button"
                onClick={handleDiscordLogin}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-lg bg-[#5865F2] hover:bg-[#4e5bda] text-white font-semibold text-[13px] transition-all duration-200 shadow-[0_2px_12px_rgba(88,101,242,0.25)] disabled:opacity-60 active:scale-[0.98]"
              >
                <svg className="w-5 h-5" viewBox="0 0 127.14 96.36" fill="currentColor">
                  <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/>
                </svg>
                Login with Discord
              </button>

              {/* Divider */}
              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[#232336]" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-[#141420] px-4 text-[11px] text-[#44445a] font-medium">
                    OR
                  </span>
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[2.5px] text-[#55556a] mb-2.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError("");
                    }}
                    placeholder="Enter admin password"
                    autoFocus
                    className="w-full rounded-lg bg-[#0d0d16] border border-[#2a2a3e] px-4 py-3 text-[14px] text-white placeholder:text-[#3a3a50] focus:border-[#5865F2] focus:ring-1 focus:ring-[#5865F2]/30 focus:outline-none transition-all pr-12"
                    style={{ fontFamily: "'Inter', sans-serif" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#44445a] hover:text-[#888] transition-colors"
                  >
                    {showPassword ? (
                      <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                        <path d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                      </svg>
                    ) : (
                      <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                        <path d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg bg-[#1c1016] border border-[#3d1f1f]">
                  <svg className="w-4 h-4 text-[#ef4444] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                  <span className="text-[13px] text-[#ef4444] font-medium">{error}</span>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || !password}
                className="w-full px-4 py-3 rounded-lg bg-[#1e1e30] hover:bg-[#262640] border border-[#2a2a3e] hover:border-[#3a3a50] text-white font-semibold text-[13px] transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98]"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Authenticating...
                  </span>
                ) : (
                  "LOGIN"
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-[11px] text-[#3a3a50]">
            v9.0 &middot; AI Game Master
          </p>
        </div>
      </div>
    </div>
  );
}
