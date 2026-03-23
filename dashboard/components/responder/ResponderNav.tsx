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
    {
      href: "/responder/dashboard",
      icon: <LayoutDashboard size={14} />,
      label: "Dashboard",
    },
    {
      href: "/responder/incidents",
      icon: <FileText size={14} />,
      label: "Incidents",
    },
    { href: "/responder/profile", icon: <User size={14} />, label: "Profile" },
  ];

  return (
    <header className='bg-[#111318] border-b border-[#1e2229] px-4 h-11 flex items-center justify-between shrink-0'>
      <div className='flex items-center gap-2'>
        <Shield size={16} className='text-[#00ff88]' />
        <span className='font-semibold text-sm text-[#c9d1e0] tracking-wide'>
          GUARDIAN
        </span>
        <span className='section-label ml-1 text-[#2a3040]'>/ RESPONDER</span>
      </div>

      <nav className='flex items-center gap-0.5'>
        {links.map((l) => {
          const active = path === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                active
                  ? "bg-[#1e2229] text-[#c9d1e0]"
                  : "text-[#4a5568] hover:text-[#c9d1e0]"
              }`}
            >
              {l.icon}
              <span className='hidden sm:inline'>{l.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className='flex items-center gap-2'>
        <span className='hidden sm:block text-xs text-[#4a5568]'>Log out</span>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className='flex items-center gap-1 border border-[#1e2229] rounded px-2 py-1 text-[#4a5568] hover:text-[#c9d1e0] hover:border-[#2a3040] bg-transparent cursor-pointer transition-colors'
        >
          <LogOut size={13} />
        </button>
      </div>
    </header>
  );
}
