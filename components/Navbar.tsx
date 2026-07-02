'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Mascot from './Mascot';

const navItems = [
  { href: '/', label: 'U-Value Calculator', active: true },
  { href: '/library', label: 'Construction Library', active: true },
  { href: '/floor-plan', label: '3D Building Modeler', active: true },
  { href: '/sap', label: 'SAP Assessment', active: false },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <header
      className="w-full flex items-center px-6 py-2.5 gap-6 shrink-0 backdrop-blur"
      style={{
        borderBottom: '1px solid rgba(12,42,31,0.08)',
        background: 'rgba(255,255,255,0.85)',
        boxShadow: '0 1px 12px rgba(12,42,31,0.04)',
      }}
    >
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
        <div style={{ width: 34, height: 42, overflow: 'hidden' }} className="transition-transform group-hover:scale-105">
          <Mascot />
        </div>
        <div className="leading-tight">
          <span className="font-black text-base tracking-tight block" style={{ color: 'var(--ink)' }}>
            ( SAP )
          </span>
          <span className="text-[9px] font-semibold tracking-[0.18em] uppercase" style={{ color: '#059669' }}>
            Assessor Studio
          </span>
        </div>
      </Link>

      {/* Nav links */}
      <nav className="flex items-center gap-1 flex-1 ml-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          if (!item.active) {
            return (
              <span
                key={item.href}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg cursor-not-allowed select-none flex items-center gap-1.5"
                style={{ color: 'rgba(12,42,31,0.35)' }}
              >
                {item.label}
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded-full font-bold tracking-wide"
                  style={{ background: 'rgba(16,185,129,0.1)', color: '#059669' }}
                >
                  SOON
                </span>
              </span>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
              style={
                isActive
                  ? { background: 'var(--ink)', color: '#ecfdf5', boxShadow: '0 2px 8px rgba(12,42,31,0.25)' }
                  : { color: 'rgba(12,42,31,0.6)' }
              }
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'rgba(16,185,129,0.08)' }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Right tag */}
      <div
        className="shrink-0 text-[10px] font-bold tracking-[0.14em] px-2.5 py-1 rounded-full"
        style={{ color: '#047857', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}
      >
        SAP 10.2 · BR443:2019
      </div>
    </header>
  );
}
