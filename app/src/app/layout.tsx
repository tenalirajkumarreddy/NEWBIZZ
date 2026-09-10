import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import "./globals.css";

// Locked type system: Inter for all UI, JetBrains Mono for every number.
// Both include the `latin-ext` subset so the Indian rupee sign ₹ (U+20B9) is
// served by the real font files rather than falling back to a system face
// (which made ₹ render at the wrong weight/metrics next to the digits).
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "NEWBIZZ",
  description: "Run the plant, the routes, and the books from one place.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0891b2",
};

// Applied before hydration (standard next-themes pattern, hand-rolled): read the
// stored preference from localStorage and set the `dark` class on <html> so the
// correct palette paints on the very first frame (no flash). Matches
// ThemeProvider's resolution: explicit light/dark, else follow the OS.
const themeInitScript = `(function(){try{var t=localStorage.getItem("nb.web.theme");var d=t==="dark"||(t==null||t==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches;if(d)document.documentElement.classList.add("dark");}catch(e){}})()`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
