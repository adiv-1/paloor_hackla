import type { Metadata } from "next";
import { DM_Sans, Playfair_Display, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Paloor",
  description: "Clear financial learning and guided tools for people new to finance",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css"
          integrity="sha384-5TcZemv2l/9On385z///+d7MSYlvIEw9FuZTIdZ14vJLqWphw7e7ZPuOiCHJcFCP"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/styles/github-dark.min.css"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('paloor-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className={`${dmSans.variable} ${playfair.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
