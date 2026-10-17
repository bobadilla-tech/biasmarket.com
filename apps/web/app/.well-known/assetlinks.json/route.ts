export const dynamic = "force-dynamic";

export function GET() {
  const fingerprint = process.env.ANDROID_APP_SHA256_CERT_FINGERPRINT;
  const packageName = process.env.ANDROID_APP_ID ?? "com.biasmarket.mobile";
  if (!fingerprint)
    return Response.json(
      { error: "Android App Links are not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );

  return Response.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: packageName,
          sha256_cert_fingerprints: [fingerprint],
        },
      },
    ],
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
