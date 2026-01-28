'use client';

import { usePathname } from 'next/navigation';
import Navbar from './Navbar';

export default function ConditionalNavbar() {
  const pathname = usePathname() ?? '';

  // Hide navbar on editor pages since VideoEditor has its own header
  if (pathname.startsWith('/editor/') || pathname.startsWith('/video')) {
    return null;
  }

  return <Navbar />;
}
