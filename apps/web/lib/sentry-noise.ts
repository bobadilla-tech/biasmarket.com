type SentryNoiseEvent = {
  message?: string;
  exception?: {
    values?: {
      value?: string;
      stacktrace?: {
        frames?: {
          filename?: string | null;
          abs_path?: string | null;
          function?: string | null;
        }[];
      };
    }[];
  };
};

export function isClosedRscPrefetchNoise(event: SentryNoiseEvent): boolean {
  return [
    event.message,
    ...(event.exception?.values ?? []).map((value) => value.value),
  ].some((message) =>
    message?.includes("The destination stream closed early."),
  );
}

export function isObscuraBootstrapNoise(event: SentryNoiseEvent): boolean {
  return (event.exception?.values ?? []).some((value) =>
    (value.stacktrace?.frames ?? []).some((frame) =>
      [frame.filename, frame.abs_path, frame.function].some((part) =>
        part?.includes("<obscura:bootstrap>"),
      ),
    ),
  );
}
