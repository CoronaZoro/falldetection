"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Shield, LayoutDashboard, Users, Camera, Sliders, FileText, Server, LogOut } from "lucide-react";

const NAV = [
  { href: "/admin/dashboard", icon: <LayoutDashboard size={14} />, label: "Overview"  },
  { href: "/admin/users",     icon: <Users size={14} />,           label: "Users"     },
  { href: "/admin/incidents", icon: <FileText size={14} />,        label: "Incidents" },
  { href: "/admin/detection", icon: <Sliders size={14} />,         label: "Detection" },
  { href: "/admin/camera",    icon: <Camera size={14} />,          label: "Camera"    },
  { href: "/admin/system",    icon: <Server size={14} />,          label: "System"    },
];

export default function AdminSidebar() {
  const path = usePathname();

  return (
    <aside className="w-52 min-h-screen bg-[#111318] border-r border-[#1e2229] flex flex-col shrink-0">
      {/* Wordmark */}
      <div className="px-4 py-4 border-b border-[#1e2229] flex items-center gap-2">
        <Shield size={16} className="text-[#00ff88]" />
        <div>
          <p className="font-semibold text-sm text-[#c9d1e0] tracking-wide">GUARDIAN</p>
          <p className="section-label text-[#2a3040]">Admin Console</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 px-2 flex flex-col gap-0.5">
        {NAV.map((item) => {
          const active = path === item.href || path.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded text-xs font-medium transition-colors border-l-2 ${
                active
                  ? "bg-[#1e2229] text-[#c9d1e0] border-[#3b82f6]"
                  : "text-[#4a5568] hover:text-[#c9d1e0] border-transparent"
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Sign out */}
      <div className="px-2 py-2 border-t border-[#1e2229]">
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-2.5 px-3 py-2 rounded text-xs text-[#4a5568] hover:text-[#c9d1e0] w-full text-left bg-transparent border-none cursor-pointer transition-colors"
        >
          <LogOut size={14} /> Sign Out
        </button>
      </div>
    </aside>
  );
}
