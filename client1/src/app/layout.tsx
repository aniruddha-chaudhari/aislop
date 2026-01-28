import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ConditionalNavbar from "./components/ConditionalNavbar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Slope - AI-Powered Content Generation",
  description: "Generate conversations, videos, and content with AI-powered tools and analysis",
  viewport: "width=device-width, initial-scale=1",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased shell-surface`}
      >
        <div className="min-h-screen text-[var(--editor-fg)]">
          <ConditionalNavbar />
          <main className="min-h-[calc(100vh-var(--app-header-h))]">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
