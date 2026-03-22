"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Shield, Eye, EyeOff, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const router   = useRouter();
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
      if (res?.error) {
        setError("Invalid credentials. Please try again.");
      } else {
        router.push("/");
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0c10] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-[#111318] border border-[#1e2229] rounded-xl mb-4">
            <Shield size={28} className="text-[#00ff88]" />
          </div>
          <h1 className="text-2xl font-bold text-[#c8d0e0] font-mono tracking-widest">GUARDIAN</h1>
          <p className="text-sm text-[#4a5568] mt-1">Fall Detection System</p>
        </div>

        {/* Card */}
        <div className="bg-[#111318] border border-[#1e2229] rounded-xl p-8">
          <h2 className="text-[17px] font-semibold text-[#c8d0e0] mb-6">Sign in to your account</h2>

          {error && (
            <div className="flex items-center gap-2 bg-[#ff3355]/10 border border-[#ff3355]/30 rounded-lg px-3 py-2.5 mb-4 text-[#ff3355] text-sm">
              <AlertCircle size={16} className="shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-[12px] text-[#4a5568] font-medium mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@guardian.com"
                required
                className="w-full bg-[#0a0c10] border border-[#1e2229] rounded-lg px-3.5 py-2.5 text-[#c8d0e0] text-sm outline-none focus:border-[#3b82f6] transition-colors"
              />
            </div>

            <div>
              <label className="block text-[12px] text-[#4a5568] font-medium mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full bg-[#0a0c10] border border-[#1e2229] rounded-lg px-3.5 py-2.5 pr-10 text-[#c8d0e0] text-sm outline-none focus:border-[#3b82f6] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4a5568] hover:text-[#c8d0e0] bg-transparent border-none cursor-pointer p-0 transition-colors"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#3b82f6] hover:bg-[#2563eb] disabled:bg-[#1e2229] disabled:text-[#4a5568] disabled:cursor-not-allowed border-none rounded-lg py-2.5 text-white font-semibold text-sm cursor-pointer mt-1 transition-colors"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          {/* Demo hint */}
          <div className="mt-6 pt-4 border-t border-[#1e2229] text-[12px] text-[#4a5568] space-y-0.5">
            <p className="mb-1">Demo accounts:</p>
            <p>admin@guardian.com / admin123</p>
            <p>responder@guardian.com / resp123</p>
          </div>
        </div>
      </div>
    </div>
  );
}
