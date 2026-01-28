'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface SidebarProps {
  className?: string;
  onToggle?: (collapsed: boolean) => void;
}

export default function Sidebar({ className = '', onToggle }: SidebarProps) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Check if mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const toggleSidebar = () => {
    if (isMobile) {
      setMobileMenuOpen(!mobileMenuOpen);
    } else {
      const newCollapsed = !isCollapsed;
      setIsCollapsed(newCollapsed);
      onToggle?.(newCollapsed);
    }
  };

  const menuItems = [
    {
      name: 'Generate Conversation',
      href: '/generate',
      icon: '🎭',
      description: 'Create new conversations with audio'
    },
    {
      name: 'Audio Browser',
      href: '/audio',
      icon: '🎵',
      description: 'Browse and manage generated audio files'
    },
    {
      name: 'Video Generator',
      href: '/video',
      icon: '🎥',
      description: 'Generate videos from conversations'
    }
  ];

  return (
    <>
      {/* Mobile toggle button - outside sidebar container */}
      {isMobile && !mobileMenuOpen && (
        <button
          onClick={toggleSidebar}
          className="fixed top-4 left-4 z-[60] p-2 rounded-md border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel-strong)_80%,transparent)] text-[var(--editor-fg)] shadow-lg transition-all duration-300 hover:border-gray-500/90 hover:bg-[color-mix(in_srgb,var(--panel-strong)_90%,transparent)]"
          title="Open menu"
        >
          <svg
            className="h-4 w-4 text-[var(--editor-fg)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}

      <div
        className={`${
          isMobile && !mobileMenuOpen
            ? 'w-0 overflow-hidden'
            : isMobile && mobileMenuOpen
              ? 'w-80 panel-elevated border-r border-[var(--border)]'
              : isCollapsed
                ? 'w-16 panel-elevated border-r border-[var(--border)] flex-shrink-0'
                : 'w-80 panel-elevated border-r border-[var(--border)] flex-shrink-0'
        } transition-all duration-300 relative ${className}`}
      >
        {/* Desktop toggle button - inside sidebar */}
        {!isMobile && (
          <button
            onClick={toggleSidebar}
            className={`absolute top-4 z-[60] p-2 rounded-md border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel-strong)_80%,transparent)] text-[var(--editor-fg)] shadow-lg transition-all duration-300 hover:border-gray-500/90 hover:bg-[color-mix(in_srgb,var(--panel-strong)_90%,transparent)] ${
              isCollapsed ? 'right-2' : 'right-4'
            }`}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg
              className={`h-4 w-4 text-[var(--editor-fg)] transition-transform duration-300 ${
                isCollapsed ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {/* Mobile close button - inside sidebar when open */}
        {isMobile && mobileMenuOpen && (
          <button
            onClick={toggleSidebar}
            className="absolute top-4 right-4 z-[60] rounded-md border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel-strong)_80%,transparent)] p-2 text-[var(--editor-fg)] shadow-lg transition-all duration-300 hover:border-gray-500/90 hover:bg-[color-mix(in_srgb,var(--panel-strong)_90%,transparent)]"
            title="Close menu"
          >
            <svg
              className="w-4 h-4 text-[#F1F1EF]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* Sidebar content - hide completely on mobile when closed */}
        {(!isMobile || mobileMenuOpen) && (
          <>
            <div className={`p-4 ${isCollapsed ? 'px-2' : ''}`}>
              {!isCollapsed && (
                <>
                  <h1 className="mb-2 text-lg font-bold text-[var(--editor-fg)]">
                    Family Guy Tech Chat
                  </h1>
                  <p className="text-xs text-[var(--editor-muted)]">
                    Generate conversations between Peter and Stewie
                  </p>
                </>
              )}
              {isCollapsed && (
                <div className="text-center">
                  <span className="text-lg">🎭</span>
                </div>
              )}
            </div>

            <nav className={`px-3 space-y-1 ${isCollapsed ? 'px-2' : ''}`}>
              {menuItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`block rounded-lg p-3 transition-colors ${
                      isCollapsed ? 'p-2 text-center' : ''
                    } ${
                      isActive
                        ? 'bg-[var(--primary)] border-l-4 border-white text-white'
                        : 'text-[var(--editor-muted)] hover:bg-[color-mix(in_srgb,var(--editor-subtle)_40%,transparent)] hover:text-[var(--foreground)]'
                    }`}
                    title={isCollapsed ? item.name : undefined}
                    onClick={() => {
                      if (isMobile) {
                        setMobileMenuOpen(false);
                      }
                    }}
                  >
                    <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'space-x-2'}`}>
                      <span className="text-lg">{item.icon}</span>
                      {!isCollapsed && (
                        <div>
                          <div className="text-sm font-medium">{item.name}</div>
                          <div className="mt-0.5 text-xs text-[var(--editor-muted)]">
                            {item.description}
                          </div>
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </nav>
          </>
        )}
      </div>
    </>
  );
}
