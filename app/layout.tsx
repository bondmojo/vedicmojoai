import type { Metadata } from "next";
import "./globals.css";
import ThemeProvider from "./components/ThemeProvider";
import AppNav from "./components/AppNav";

export const metadata: Metadata = {
  title: "VedicMojoAI",
  description: "AI-powered Vedic Astrology analysis platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning: next-themes sets the resolved theme class on
    // <html> before hydration; without this, React warns about the
    // server/client class mismatch that is expected and harmless here.
    <html lang="en" suppressHydrationWarning>
      <body className="bg-background font-sans text-foreground">
        <ThemeProvider>
          <AppNav />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
