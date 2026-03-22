"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Shield, LayoutDashboard, Users, Camera, Sliders,
  FileText, Server, LogOut,
} from "lucide-react";

const NAV = [
  { href: "/admin/dashboard", icon: <LayoutDashboard size={16} />, label: "Overview"   },
  { href: "/admin/users",     icon: <Users size={16} />,           label: "Users"      },
  { href: "/admin/incidents", icon: <FileText size={16} />,        label: "Incidents"  },
  { href: "/admin/detection", icon: <Sliders size={16} />,         label: "Detection"  },
  { href: "/admin/camera",    icon: <Camera size={16} />,          label: "Camera"     },
  { href: "/admin/system",    icon: <Server size={16} />,          label: "System"     },
];

export default function AdminSidebar() {
  const path = usePathname();

  return (
    <aside className="w-[220px] min-h-screen bg-[#111318] border-r border-[#1e2229] flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-[#1e2229] flex items-center gap-2.5">
        <Shield size={20} className="text-[#00ff88]" />
        <div>
          <p className="font-mono font-bold text-[14px] text-[#c8d0e0]">GUARDIAN</p>
          <p className="text-[11px] text-[#4a5568]">Admin Console</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 flex flex-col gap-0.5">
        {NAV.map((item) => {
          const active = path === item.href || path.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded text-[13px] transition-colors border-l-2 ${
                active
                  ? "bg-[#1e2229] text-[#c8d0e0] border-[#3b82f6]"
                  : "text-[#4a5568] hover:text-[#c8d0e0] border-transparent"
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Sign out */}
      <div className="p-2 border-t border-[#1e2229]">
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-2.5 px-3 py-2 rounded text-[13px] text-[#4a5568] hover:text-[#c8d0e0] w-full text-left bg-transparent border-none cursor-pointer transition-colors"
        >
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
