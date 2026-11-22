import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AppRail } from "@/components/app-rail";
import { getSessionUser } from "@/lib/auth";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Logistics AI Analytics",
  description: "AI-powered logistics analytics: KPIs, natural-language queries, and demand forecasting.",
};

const themeInit = `(function(){try{var t=localStorage.getItem("theme");if(!t){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getSessionUser();

  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className={`${geistSans.variable} font-sans antialiased`}>
        {user ? (
          <div className="flex h-screen overflow-hidden bg-[var(--page)]">
            <AppRail user={{ name: user.name, roleName: user.roleName }} permissions={user.permissions} />
            <main className="flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-[1440px] px-6 py-6 lg:px-8">{children}</div>
            </main>
          </div>
        ) : (
          <div className="bg-[var(--page)]">{children}</div>
        )}
      </body>
    </html>
  );
}
