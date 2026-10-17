module.exports = ({ config }) => {
  const projectId = process.env.EAS_PROJECT_ID || config.extra?.eas?.projectId;

  return {
    ...config,
    runtimeVersion: { policy: "appVersion" },
    updates: {
      ...config.updates,
      ...(projectId
        ? { url: `https://u.expo.dev/${projectId}`, enabled: true }
        : {}),
    },
    extra: {
      ...config.extra,
      ...(projectId ? { eas: { ...config.extra?.eas, projectId } } : {}),
    },
  };
};
