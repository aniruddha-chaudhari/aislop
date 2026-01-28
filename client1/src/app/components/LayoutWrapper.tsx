'use client';

import { useState } from 'react';
import Sidebar from './Sidebar';

interface LayoutWrapperProps {
  children: React.ReactNode;
}

export default function LayoutWrapper({ children }: LayoutWrapperProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleSidebarToggle = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
  };

  return (
    <div className="flex min-h-screen shell-surface text-[var(--editor-fg)]">
      <Sidebar
        className="transition-all duration-300"
        onToggle={handleSidebarToggle}
      />
      <main className="flex-1 overflow-auto bg-transparent md:pl-0 pl-0">
        <div className="md:p-0 pt-16 md:pt-0">
          {children}
        </div>
      </main>
    </div>
  );
}
