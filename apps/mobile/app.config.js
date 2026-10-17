import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDirectory = path.dirname(fileURLToPath(import.meta.url));
const readLocale = (locale) =>
  JSON.parse(
    readFileSync(
      path.resolve(appDirectory, `../../packages/i18n/${locale}/mobile.json`),
      "utf8",
    ),
  );

const locales = { en: readLocale("en"), es: readLocale("es") };

export default ({ config }) => {
  const englishMessages = locales.en;
  const plugins = (config.plugins ?? []).map((plugin) => {
    if (!Array.isArray(plugin) || plugin[0] !== "expo-image-picker") {
      return plugin;
    }

    return [
      plugin[0],
      {
        ...plugin[1],
        photosPermission: englishMessages.ios.NSPhotoLibraryUsageDescription,
        cameraPermission: englishMessages.ios.NSCameraUsageDescription,
      },
    ];
  });
  const projectId =
    process.env.EAS_PROJECT_ID ??
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
    config.extra?.eas?.projectId;

  return {
    ...config,
    runtimeVersion: { policy: "appVersion" },
    updates: {
      ...config.updates,
      ...(projectId
        ? { url: `https://u.expo.dev/${projectId}`, enabled: true }
        : {}),
    },
    ios: {
      ...config.ios,
      infoPlist: {
        ...config.ios?.infoPlist,
        CFBundleLocalizations: ["en", "es"],
      },
    },
    extra: {
      ...config.extra,
      eas: {
        ...config.extra?.eas,
        ...(projectId ? { projectId } : {}),
      },
    },
    locales: {
      en: { ios: locales.en.ios },
      es: { ios: locales.es.ios },
    },
    plugins,
  };
};
