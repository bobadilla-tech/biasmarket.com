import Image from "next/image";
import { cn } from "@/lib/utils";
import { urlForImage } from "../lib/sanity";
import type { BlogPostSummary } from "../server";

type CoverImage = BlogPostSummary["coverImage"];

export function BlogCoverImage({
  image,
  title,
  className,
  priority = false,
  sizes = "(min-width: 768px) 768px, 100vw",
}: {
  image: CoverImage;
  title: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  if (!image) return null;

  const src = urlForImage(image, 1600);
  if (!src) return null;

  return (
    <Image
      src={src}
      alt={image.alt || title}
      width={1600}
      height={900}
      sizes={sizes}
      priority={priority}
      className={cn("h-auto w-full object-cover", className)}
    />
  );
}
