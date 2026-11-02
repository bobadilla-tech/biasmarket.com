import { existsSync } from "node:fs";
import path from "node:path";
import { getDefaultConfig } from "expo/metro-config.js";
import nativewind from "nativewind/dist/metro/index.js";

const { withNativeWind } = nativewind;
const config = getDefaultConfig(import.meta.dirname);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith(".") && moduleName.endsWith(".js")) {
    const extensionless = moduleName.slice(0, -3);
    for (const extension of [".ts", ".tsx"]) {
      const sourcePath = path.resolve(
        path.dirname(context.originModulePath),
        `${extensionless}${extension}`,
      );
      if (existsSync(sourcePath)) {
        return context.resolveRequest(
          context,
          `${extensionless}${extension}`,
          platform,
        );
      }
    }
  }

  return context.resolveRequest(context, moduleName, platform);
};

export default withNativeWind(config, {
  input: "./src/global.css",
  configFile: "./tailwind.config.ts",
});
