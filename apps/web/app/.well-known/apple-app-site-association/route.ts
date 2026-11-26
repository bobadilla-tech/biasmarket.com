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
              {
                "/": "/*/store/*/product/*/*",
                exclude: true,
                comment: "Exclude extra path segments under product",
              },
              {
                "/": "/*/store/*/product/",
                exclude: true,
                comment: "Exclude empty product id",
              },
              {
                "/": "/*/store/*/product/*",
                comment: "Localized product detail",
              },
              {
                "/": "/*/store/*/account/orders/*/*",
                exclude: true,
                comment: "Exclude extra path segments under orders",
              },
              {
                "/": "/*/store/*/account/orders/",
                exclude: true,
                comment: "Exclude empty order id",
              },
              {
                "/": "/*/store/*/account/orders/*",
                comment: "Localized buyer order detail",
              },
              {
                "/": "/*/store/*/*",
                exclude: true,
                comment:
                  "Keep nested store URLs, including private orders, on the web",
              },
              {
                "/": "/*/store/",
                exclude: true,
                comment: "Exclude an empty store slug",
              },
              {
                "/": "/*/store/*",
                comment: "Localized store page",
              },
            ],
          },
        ],
      },
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
