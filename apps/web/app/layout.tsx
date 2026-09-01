import "./globals.css";
import type { Metadata, Viewport } from "next";
import { TopBar } from "@/components/TopBar";

export const metadata: Metadata = {
  title: "Bet Hub",
  description: "Multi-sport model picks with an accuracy & P/L tracker.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Bet Hub", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0d" },
  ],
};

// Set the theme before paint to avoid a flash.
const themeInit = `(function(){try{var t=localStorage.getItem('theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <TopBar />
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
