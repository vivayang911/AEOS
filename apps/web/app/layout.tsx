import type { Metadata } from "next";
import "./styles.css";
import "./chromatic.css";
import "./p0-e2e.css";
import { AppShell } from "./ui/app-shell";
import { SessionProvider } from "./ui/session-context";
import { LanguageProvider } from "./ui/language-context";

export const metadata: Metadata = { title: "AEOS Treasury Cockpit", description: "Evidence-first DAO treasury governance cockpit" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><LanguageProvider><SessionProvider><AppShell>{children}</AppShell></SessionProvider></LanguageProvider></body></html>;
}
