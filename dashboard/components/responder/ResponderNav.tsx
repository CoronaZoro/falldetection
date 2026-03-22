"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Shield, LayoutDashboard, FileText, User, LogOut } from "lucide-react";

interface Props {
  user: { name: string; email: string };
}

export default function ResponderNav({ user }: Props) {
  const path = usePathname();

  const links = [
    { href: "/responder/dashboard", icon: <LayoutDashboard size={16} />, label: "Dashboard" },
    { href: "/responder/incidents",  icon: <FileText size={16} />,       label: "Incidents"  },
    { href: "/responder/profile",    icon: <User size={16} />,           label: "Profile"    },
  ];

  return (
    <header className="bg-[#111318] border-b border-[#1e2229] px-4 h-[52px] flex items-center justify-between shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <Shield size={20} className="text-[#00ff88]" />
        <span className="font-mono font-bold text-[15px] text-[#c8d0e0] tracking-wide">GUARDIAN</span>
      </div>

      {/* Nav links */}
      <nav className="flex items-center gap-1">
        {links.map((l) => {
          const active = path === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[13px] transition-colors ${
                active
                  ? "bg-[#1e2229] text-[#c8d0e0]"
                  : "text-[#4a5568] hover:text-[#c8d0e0]"
              }`}
            >
              {l.icon}
              <span className="hidden sm:inline">{l.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User + signout */}
      <div className="flex items-center gap-3">
        <div className="hidden sm:block text-right">
          <p className="text-[13px] text-[#c8d0e0] font-medium">{user.name}</p>
          <p className="text-[11px] text-[#4a5568]">Responder</p>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-1.5 border border-[#1e2229] rounded px-2.5 py-1.5 text-[#4a5568] hover:text-[#c8d0e0] hover:border-[#2a3040] cursor-pointer bg-transparent transition-colors text-[13px]"
        >
          <LogOut size={14} />
        </button>
      </div>
    </header>
  );
}
