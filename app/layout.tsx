import type { Metadata, Viewport } from "next";

import { AppShell } from "@/components/app-shell";
import { PwaRegistration } from "@/components/pwa-registration";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "어제의 핵심",
    template: "%s · 어제의 핵심",
  },
  description:
    "어제 세상에서 정말 중요했던 일을 하루 10분 안에 이해하고 생각하는 개인 뉴스 앱",
  applicationName: "어제의 핵심",
  appleWebApp: { capable: true, title: "어제의 핵심", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1117" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        <AppShell>{children}</AppShell>
        <PwaRegistration />
      </body>
    </html>
  );
}
