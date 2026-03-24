import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GUARDIAN — Fall Detection System",
  description: "Real-time AI fall detection and emergency alert system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang='en' className='h-full'>
      <head>
        <link rel='preconnect' href='https://fonts.googleapis.com' />
        <link
          rel='preconnect'
          href='https://fonts.gstatic.com'
          crossOrigin='anonymous'
        />
        <link
          href='https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap'
          rel='stylesheet'
        />
      </head>
      <body className='h-full'>{children}</body>
    </html>
  );
}
