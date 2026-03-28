"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Shield, LayoutDashboard, Users, Settings, FileText, Server, LogOut } from "lucide-react";

const NAV = [
  { href: "/admin/dashboard", icon: <LayoutDashboard size={14} />, label: "Overview"  },
  { href: "/admin/users",     icon: <Users size={14} />,           label: "Users"     },
  { href: "/admin/incidents", icon: <FileText size={14} />,        label: "Incidents" },
  { href: "/admin/detection", icon: <Settings size={14} />,        label: "Settings"  },
  { href: "/admin/system",    icon: <Server size={14} />,          label: "System"    },
];

export default function AdminSidebar() {
  const path = usePathname();

  return (
    <aside className='w-52 min-h-screen bg-surface border-r border-line flex flex-col shrink-0'>
      <div className='px-4 py-4 border-b border-line flex items-center gap-2'>
        <Shield size={16} className='text-success' />
        <div>
          <p className='font-semibold text-sm text-fg tracking-wide'>GUARDIAN</p>
          <p className='section-label text-line-muted'>Admin Console</p>
        </div>
      </div>

      <nav className='flex-1 py-2 px-2 flex flex-col gap-0.5'>
        {NAV.map((item) => {
          const active = path === item.href || path.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded text-xs font-medium transition-colors border-l-2 ${
                active
                  ? "bg-line text-fg border-info"
                  : "text-fg-muted hover:text-fg border-transparent"
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className='px-2 py-2 border-t border-line'>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className='flex items-center gap-2.5 px-3 py-2 rounded text-xs text-fg-muted hover:text-fg w-full text-left bg-transparent border-none cursor-pointer transition-colors'
        >
          <LogOut size={14} /> Sign Out
        </button>
      </div>
    </aside>
  );
}
