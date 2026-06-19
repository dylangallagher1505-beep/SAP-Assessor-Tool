'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Mascot from './Mascot';

const navItems = [
  { href: '/', label: 'U-VALUE CALCULATOR', active: true },
  { href: '/library', label: 'CONSTRUCTION LIBRARY', active: true },
  { href: '/sap', label: 'SAP ASSESSMENT', active: false },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <header
      className="w-full flex items-center px-8 py-4 gap-8 shrink-0"
      style={{ borderBottom: '2px solid #dcfce7', background: '#ffffff' }}
    >
      {/* Logo */}
      <Link href="/" className="flex items-center gap-3 shrink-0">
        <div style={{ width: 40, height: 50, overflow: 'hidden' }}>
          <Mascot />
        </div>
        <span
          className="font-black text-lg tracking-tight leading-tight"
          style={{ color: '#14532d' }}
        >
          ( SAP )
        </span>
      </Link>

      {/* Nav links */}
      <nav className="flex items-center gap-8 flex-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          if (!item.active) {
            return (
              <span
                key={item.href}
                className="text-xs font-black tracking-widest cursor-not-allowed select-none"
                style={{ color: '#86efac', opacity: 0.6 }}
              >
                {item.label}
                <span
                  className="ml-2 text-xs px-1.5 py-0.5 rounded font-bold"
                  style={{ background: '#f0fdf4', color: '#86efac' }}
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
              className="text-xs font-black tracking-widest transition-all pb-1"
              style={{
                color: isActive ? '#14532d' : '#6b7280',
                borderBottom: isActive ? '3px solid #16a34a' : '3px solid transparent',
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Right tag */}
      <div className="shrink-0 text-xs font-black tracking-widest" style={{ color: '#86efac' }}>
        SAP 10.2 · BR443:2019
      </div>
    </header>
  );
}
