"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Shield, LayoutDashboard, FileText, User, LogOut, AlertTriangle } from "lucide-react";
import { useIncidentContext } from "./IncidentContext";

interface Props {
  user: { name: string; email: string };
}

export default function ResponderNav({ user }: Props) {
  const path = usePathname();
  const { hasActiveIncident } = useIncidentContext();

  const links = [
    { href: "/responder/dashboard", icon: <LayoutDashboard size={14} />, label: "Dashboard" },
    { href: "/responder/incidents", icon: <FileText size={14} />, label: "Incident Logs" },
    { href: "/responder/profile",   icon: <User size={14} />,          label: "Profile" },
  ];

  return (
    <header className='bg-surface border-b border-line px-4 h-11 flex items-center justify-between shrink-0'>
      <div className='flex items-center gap-2'>
        <Shield size={16} className='text-success' />
        <span className='font-semibold text-sm text-fg tracking-wide'>GUARDIAN</span>
        <span className='section-label ml-1 text-line-muted'>/ RESPONDER</span>
      </div>

      <nav className='flex items-center gap-0.5'>
        {/* Active incident warning badge */}
        {hasActiveIncident && (
          <span className='flex items-center gap-1 px-2 py-1 rounded bg-danger/10 border border-danger/20 mr-1'>
            <AlertTriangle size={10} className='text-danger' />
            <span className='text-[10px] font-semibold text-danger hidden sm:inline'>Active incident</span>
          </span>
        )}

        {links.map((l) => {
          const active = path === l.href;
          const isDashboard = l.href === "/responder/dashboard";
          // Lock non-dashboard links while an incident is active
          const locked = hasActiveIncident && !isDashboard;

          if (locked) {
            return (
              <span
                key={l.href}
                title='Resolve the active incident before navigating'
                className='flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-fg-muted/40 cursor-not-allowed select-none'
              >
                {l.icon}
                <span className='hidden sm:inline'>{l.label}</span>
              </span>
            );
          }

          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                active ? "bg-line text-fg" : "text-fg-muted hover:text-fg"
              }`}
            >
              {l.icon}
              <span className='hidden sm:inline'>{l.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className='flex items-center gap-2'>
        <span className='hidden sm:block text-xs text-fg-muted'>{user.name}</span>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className='flex items-center gap-1 border border-line rounded px-2 py-1 text-fg-muted hover:text-fg hover:border-line-muted bg-transparent cursor-pointer transition-colors'
        >
          <LogOut size={13} />
        </button>
      </div>
    </header>
  );
}
