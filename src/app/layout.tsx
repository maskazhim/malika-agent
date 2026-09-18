import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Malika Agent — AI Teammate yang Punya Komputer Sendiri",
  description:
    "Agent AI yang kerja 24/7 di server untuk bisnis Indonesia: rekrutmen JobStreet, keuangan Jurnal.id, Instagram, LinkedIn, Google Maps. Tanpa laptop kamu nyala.",
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased scroll-smooth`}
    >
      <body className="fluid-bg min-h-full flex flex-col">
        <div className="fluid-layer" aria-hidden>
          <span className="fluid-blob fluid-blob-1" />
          <span className="fluid-blob fluid-blob-2" />
          <span className="fluid-blob fluid-blob-3" />
        </div>
        <div className="relative z-10 flex min-h-full flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
