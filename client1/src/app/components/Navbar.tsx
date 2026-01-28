'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/generate', label: 'Audio' },
  { href: '/library', label: 'Library' },
  { href: '/projects', label: 'Projects' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/projects') return pathname === '/projects' || pathname.startsWith('/editor/');
  return pathname === href;
}

export default function Navbar() {
  const pathname = usePathname() ?? '';

  return (
    <header
      className="sticky top-0 z-50 h-[var(--app-header-h)] border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_86%,transparent)] backdrop-blur supports-[backdrop-filter]:bg-[color-mix(in_srgb,var(--panel)_70%,transparent)]"
      role="banner"
    >
      <div className="mx-auto flex h-full max-w-[1600px] items-center justify-between gap-3 px-3 sm:px-4">
        <Link href="/projects" className="group flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-[var(--primary)] shadow-[0_14px_32px_var(--shadow)]">
            <span className="text-sm font-semibold tracking-tight text-white">A</span>
          </div>
          <div className="hidden sm:block">
            <div className="text-sm font-semibold tracking-tight">AI Slope Studio</div>
            <div className="text-[11px] leading-3 text-[var(--editor-muted)]">Editor workspace</div>
          </div>
        </Link>

        <nav className="flex items-center gap-1 rounded-2xl border border-[var(--border)] bg-[var(--panel-strong)] p-1 shadow-[0_18px_40px_var(--shadow)]">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  'rounded-xl px-3 py-2 text-xs font-medium transition border border-transparent',
                  active
                    ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary-foreground)]'
                    : 'text-[var(--editor-muted)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)]',
                ].join(' ')}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel-strong)_80%,transparent)] px-3 py-2 text-[11px] text-[var(--editor-muted)]">
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--accent-2)] shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent-2)_18%,transparent)]" />
            UI-only prototype
          </div>
        </div>
      </div>
    </header>
  );
}

