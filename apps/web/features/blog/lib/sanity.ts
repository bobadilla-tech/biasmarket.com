import {
  createImageUrlBuilder,
  type SanityImageSource,
} from "@sanity/image-url";
import { createClient } from "next-sanity";

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET;

export const client = projectId && dataset
  ? createClient({
    projectId,
    dataset,
    apiVersion: "2026-08-13",
    useCdn: true,
  })
  : null;

const imageBuilder = client ? createImageUrlBuilder(client) : null;

/**
 * Build a Sanity Image CDN URL for a cover image, or `null` when the Sanity
 * client is unconfigured or no source is provided. Callers render the result
 * with `next/image` (cdn.sanity.io is whitelisted in next.config.ts).
 */
export function urlForImage(
  source: SanityImageSource | null | undefined,
  width?: number,
): string | null {
  if (!imageBuilder || !source) return null;

  const builder = width
    ? imageBuilder.image(source).width(width)
    : imageBuilder.image(source);

  return builder.auto("format").url();
}
