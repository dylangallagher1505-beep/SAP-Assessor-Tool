'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Mascot from './Mascot';

const navItems = [
  { href: '/', label: 'U-Value Calculator', icon: '⚡', active: true },
  { href: '/library', label: 'Construction Library', icon: '📚', active: true },
  { href: '/sap', label: 'SAP Assessment', icon: '📋', active: false },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-72 flex flex-col h-full shrink-0" style={{ background: '#0f1729' }}>
      <div
        className="flex flex-col items-center px-5 pt-8 pb-6"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <Mascot />
        <div className="mt-4 text-white font-black text-xl tracking-tight leading-tight text-center">
          SAP Assessor
        </div>
      </div>

      <nav className="flex-1 px-4 py-5 space-y-1.5">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          if (!item.active) {
            return (
              <div
                key={item.href}
                className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-not-allowed select-none"
                style={{ opacity: 0.35 }}
              >
                <span className="text-base">{item.icon}</span>
                <span className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>
                  {item.label}
                </span>
                <span
                  className="ml-auto text-xs px-2 py-0.5 rounded-md font-bold"
                  style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}
                >
                  Soon
                </span>
              </div>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-semibold text-sm"
              style={
                isActive
                  ? { background: '#FFF8F0', color: '#0f1729', borderLeft: '4px solid #FFD700' }
                  : { color: 'rgba(255,255,255,0.6)', borderLeft: '4px solid transparent' }
              }
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.3)' }}>
          SAP 10.2 · BR443:2019
        </div>
      </div>
    </aside>
  );
}
