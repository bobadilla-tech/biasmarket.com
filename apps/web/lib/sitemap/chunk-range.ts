export interface EntityChunkRange {
  entityOffset: number;
  entityLimit: number;
  sliceStart: number;
  sliceEnd: number;
}

export function chunkEntityRange(
  chunkId: number,
  chunkSize: number,
  localeCount: number,
): EntityChunkRange {
  if (!Number.isSafeInteger(chunkId) || chunkId < 0) {
    throw new RangeError("chunkId must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
    throw new RangeError("chunkSize must be a positive safe integer");
  }
  if (!Number.isSafeInteger(localeCount) || localeCount <= 0) {
    throw new RangeError("localeCount must be a positive safe integer");
  }

  const urlStart = chunkId * chunkSize;
  const urlEnd = urlStart + chunkSize;
  if (!Number.isSafeInteger(urlStart) || !Number.isSafeInteger(urlEnd)) {
    throw new RangeError("chunk range exceeds safe integer bounds");
  }

  const entityOffset = Math.floor(urlStart / localeCount);
  return {
    entityOffset,
    entityLimit: Math.ceil(urlEnd / localeCount) - entityOffset,
    sliceStart: urlStart - entityOffset * localeCount,
    sliceEnd: urlEnd - entityOffset * localeCount,
  };
}
