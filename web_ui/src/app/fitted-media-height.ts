/** Height for a tile of `tileWidthPx`, matching the media's pixel aspect. Square until the size is known. */
export function fittedMediaHeight(
  tileWidthPx: number,
  mediaWidth: number,
  mediaHeight: number,
): number {
  if (!(mediaWidth > 0) || !(mediaHeight > 0)) return tileWidthPx;
  return (tileWidthPx * mediaHeight) / mediaWidth;
}
