'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: 'U-Value Calculator', icon: '⚡', active: true },
  { href: '/library', label: 'Construction Library', icon: '📚', active: true },
  { href: '/sap', label: 'SAP Assessment', icon: '📋', active: false },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-64 bg-slate-900 flex flex-col h-full shrink-0">
      <div className="px-5 py-6 border-b border-slate-700">
        <div className="text-white font-bold text-base leading-tight">SAP Assessor Tool</div>
        <div className="text-slate-400 text-xs mt-1">Melin Consultants</div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          if (!item.active) {
            return (
              <div key={item.href} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 cursor-not-allowed select-none">
                <span className="text-sm opacity-50">{item.icon}</span>
                <span className="text-sm opacity-50">{item.label}</span>
                <span className="ml-auto text-xs bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded">Soon</span>
              </div>
            );
          }
          return (
            <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
              isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}>
              <span className="text-sm">{item.icon}</span>
              <span className="text-sm font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="px-5 py-4 border-t border-slate-700">
        <div className="text-slate-500 text-xs">SAP 10.2 / BR443:2019</div>
      </div>
    </aside>
  );
}
