"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Shield, Eye, EyeOff, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await signIn("credentials", { email, password, redirect: false });
      if (res?.error) setError("Invalid email or password.");
      else { router.push("/"); router.refresh(); }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0c10] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Mark */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-[#111318] border border-[#1e2229] rounded-lg flex items-center justify-center">
            <Shield size={20} className="text-[#00ff88]" />
          </div>
          <div className="text-center">
            <h1 className="font-semibold text-base text-[#c9d1e0] tracking-widest">GUARDIAN</h1>
            <p className="section-label mt-0.5">Fall Detection System</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-[#111318] border border-[#1e2229] rounded-lg p-6">
          <h2 className="text-sm font-semibold text-[#c9d1e0] mb-5">Sign in</h2>

          {error && (
            <div className="flex items-center gap-2 bg-[#ff3355]/08 border border-[#ff3355]/20 rounded px-3 py-2 mb-4 text-[#ff3355] text-xs">
              <AlertCircle size={13} className="shrink-0" /> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <div>
              <label className="section-label mb-1.5 block">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@guardian.com"
                required
                className="w-full bg-[#0a0c10] border border-[#1e2229] rounded px-3 py-2 text-sm text-[#c9d1e0] outline-none focus:border-[#3b82f6] transition-colors placeholder:text-[#2a3040]"
              />
            </div>

            <div>
              <label className="section-label mb-1.5 block">Password</label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full bg-[#0a0c10] border border-[#1e2229] rounded px-3 py-2 pr-9 text-sm text-[#c9d1e0] outline-none focus:border-[#3b82f6] transition-colors placeholder:text-[#2a3040]"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4a5568] hover:text-[#c9d1e0] bg-transparent border-none cursor-pointer p-0 transition-colors"
                >
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 disabled:cursor-not-allowed border-none rounded py-2.5 text-white text-sm font-medium cursor-pointer mt-1 transition-colors"
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-[#1e2229]">
            <p className="section-label mb-2">Demo accounts</p>
            <div className="flex flex-col gap-1 text-xs text-[#4a5568]">
              <span>admin@guardian.com · admin123</span>
              <span>responder@guardian.com · resp123</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
