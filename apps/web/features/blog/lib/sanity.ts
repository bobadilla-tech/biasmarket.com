import { createClient } from "next-sanity";

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET;

export const client =
  projectId && dataset
    ? createClient({
        projectId,
        dataset,
        apiVersion: "2026-08-13",
        useCdn: true,
      })
    : null;
