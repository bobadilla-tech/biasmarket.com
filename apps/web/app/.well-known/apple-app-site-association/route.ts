export const dynamic = "force-dynamic";

export function GET() {
  const teamId = process.env.IOS_TEAM_ID;
  const bundleId = process.env.IOS_BUNDLE_ID ?? "com.biasmarket.mobile";
  if (!teamId)
    return Response.json(
      { error: "Universal Links are not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );

  return Response.json(
    {
      applinks: {
        apps: [],
        details: [
          {
            appIDs: [`${teamId}.${bundleId}`],
            components: [
              { "/": "/store/*/product/*", comment: "Product detail" },
              {
                "/": "/store/*/account/orders/*",
                comment: "Buyer order detail",
              },
            ],
          },
        ],
      },
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
