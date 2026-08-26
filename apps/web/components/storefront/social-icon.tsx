import type { ReactNode } from "react";

type SocialPlatform = "instagram" | "facebook" | "tiktok" | "twitter";

const icons: Record<SocialPlatform, ReactNode> = {
  instagram: (
    <svg viewBox="0 0 24 24" fill="none" className="size-4">
      <rect
        x="2"
        y="2"
        width="20"
        height="20"
        rx="5"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2" />
      <circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" />
    </svg>
  ),
  facebook: (
    <svg viewBox="0 0 24 24" fill="none" className="size-4">
      <path
        d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3V2Z"
        fill="currentColor"
      />
    </svg>
  ),
  tiktok: (
    <svg viewBox="0 0 24 24" fill="none" className="size-4">
      <path
        d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  twitter: (
    <svg viewBox="0 0 24 24" fill="none" className="size-4">
      <path
        d="M4 4l6.5 8L4 20h2l5.5-6.8L16 20h4l-6.8-8.5L20 4h-2l-5.2 6.4L8 4H4Z"
        fill="currentColor"
      />
    </svg>
  ),
};

const labels: Record<SocialPlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  twitter: "X",
};

export function SocialIcon({ platform }: { platform: string }) {
  const icon = icons[platform as SocialPlatform];
  if (!icon) return null;
  return (
    <>
      {icon}
      <span className="sr-only">
        {labels[platform as SocialPlatform] ?? platform}
      </span>
    </>
  );
}
