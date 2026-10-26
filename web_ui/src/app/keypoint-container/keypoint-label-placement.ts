export type LabelCorner = 'se' | 'ne' | 'sw' | 'nw';

export interface PlacedLabel {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LabelOffset {
  top: number;
  left: number;
}

export interface LabelFrame {
  width: number;
  height: number;
}

const CORNERS: LabelCorner[] = ['se', 'ne', 'sw', 'nw'];

// A 1px graze is not an overlap, so jitter does not flip a corner.
const OVERLAP_SLACK_PX = 2;

/** Label outline width as a fraction of the font size (2px at the default 8px). */
export const LABEL_STROKE_EM = 0.25;

/**
 * Outline that shows outside the letters: paint-order draws the stroke under
 * the fill, so half its width is outside the ink.
 */
export function labelStrokePad(fontSizePx: number): number {
  return (fontSizePx * LABEL_STROKE_EM) / 2;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function offsetFor(
  corner: LabelCorner,
  markerSize: number,
  labelW: number,
  labelH: number,
): LabelOffset {
  // Same tuck as the old fixed lower-right: size/1.15 from the circle's top-left.
  const tuck = markerSize / 1.15;
  const inset = markerSize - tuck;
  switch (corner) {
    case 'se':
      return { left: tuck, top: tuck };
    case 'ne':
      return { left: tuck, top: -labelH + inset };
    case 'sw':
      return { left: -labelW + inset, top: tuck };
    case 'nw':
      return { left: -labelW + inset, top: -labelH + inset };
  }
}

function boxFor(
  label: PlacedLabel,
  corner: LabelCorner,
  markerSize: number,
): Box {
  const offset = offsetFor(corner, markerSize, label.w, label.h);
  return {
    x: label.x - markerSize / 2 + offset.left,
    y: label.y - markerSize / 2 + offset.top,
    w: label.w,
    h: label.h,
  };
}

interface Circle {
  x: number;
  y: number;
  r: number;
}

function intersectionArea(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= OVERLAP_SLACK_PX || h <= OVERLAP_SLACK_PX) return 0;
  return w * h;
}

function markerOverlapArea(box: Box, marker: Circle): number {
  const closestX = Math.max(box.x, Math.min(marker.x, box.x + box.w));
  const closestY = Math.max(box.y, Math.min(marker.y, box.y + box.h));
  const dist = Math.hypot(marker.x - closestX, marker.y - closestY);
  // A tiny marker still counts when the name covers its center. A 1px graze does not.
  const slack = Math.min(OVERLAP_SLACK_PX, marker.r / 2);
  if (marker.r - dist <= slack) return 0;
  const w =
    Math.min(box.x + box.w, marker.x + marker.r) -
    Math.max(box.x, marker.x - marker.r);
  const h =
    Math.min(box.y + box.h, marker.y + marker.r) -
    Math.max(box.y, marker.y - marker.r);
  return Math.max(0, w) * Math.max(0, h);
}

function collisionArea(box: Box, labels: Box[], markers: Circle[]): number {
  let area = 0;
  for (const other of labels) area += intersectionArea(box, other);
  for (const marker of markers) area += markerOverlapArea(box, marker);
  return area;
}

// Another marker must be at least this much closer to a label than its own
// marker before the label counts as nearer the other one.
const NEARER_SLACK_PX = 0.5;

function distanceToBox(box: Box, x: number, y: number): number {
  const closestX = Math.max(box.x, Math.min(x, box.x + box.w));
  const closestY = Math.max(box.y, Math.min(y, box.y + box.h));
  return Math.hypot(x - closestX, y - closestY);
}

/**
 * True when some other marker is closer to the label box than the label's own
 * marker, so the name could be read as belonging to that other point (#154).
 */
function nearerOtherMarker(box: Box, own: Circle, others: Circle[]): boolean {
  const ownDistance = distanceToBox(box, own.x, own.y);
  return others.some(
    (marker) =>
      distanceToBox(box, marker.x, marker.y) + NEARER_SLACK_PX < ownDistance,
  );
}

function frameReady(frame: LabelFrame): boolean {
  return frame.width > 0 && frame.height > 0;
}

function insideFrame(box: Box, frame: LabelFrame): boolean {
  if (!frameReady(frame)) return true;
  return (
    box.x >= -0.5 &&
    box.y >= -0.5 &&
    box.x + box.w <= frame.width + 0.5 &&
    box.y + box.h <= frame.height + 0.5
  );
}

function overflowArea(box: Box, frame: LabelFrame): number {
  if (!frameReady(frame)) return 0;
  const x0 = Math.max(box.x, 0);
  const y0 = Math.max(box.y, 0);
  const x1 = Math.min(box.x + box.w, frame.width);
  const y1 = Math.min(box.y + box.h, frame.height);
  const inside = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  return Math.max(0, box.w * box.h - inside);
}

export function placeKeypointLabels(
  labels: readonly PlacedLabel[],
  markerSize: number,
  frame: LabelFrame,
  previousCorners: ReadonlyMap<string, LabelCorner>,
): {
  offsets: Map<string, LabelOffset>;
  corners: Map<string, LabelCorner>;
} {
  const ordered = [...labels].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const markers = new Map<string, Circle>(
    ordered.map((label) => [
      label.id,
      { x: label.x, y: label.y, r: markerSize / 2 },
    ]),
  );
  const accepted: Box[] = [];
  const offsets = new Map<string, LabelOffset>();
  const corners = new Map<string, LabelCorner>();

  for (const label of ordered) {
    // The corner tuck sits just outside this point's own circle.
    const otherMarkers: Circle[] = [];
    for (const [id, marker] of markers) {
      if (id !== label.id) otherMarkers.push(marker);
    }
    const previous = previousCorners.get(label.id);
    let chosen: LabelCorner | null = null;

    const ownMarker = markers.get(label.id)!;
    const box = (corner: LabelCorner) => boxFor(label, corner, markerSize);
    const clear = (corner: LabelCorner) => {
      const candidate = box(corner);
      return (
        insideFrame(candidate, frame) &&
        collisionArea(candidate, accepted, otherMarkers) === 0 &&
        !nearerOtherMarker(candidate, ownMarker, otherMarkers)
      );
    };

    if (clear('se')) {
      chosen = 'se';
    } else if (previous && previous !== 'se' && clear(previous)) {
      chosen = previous;
    }

    if (!chosen) {
      for (const corner of CORNERS) {
        if (clear(corner)) {
          chosen = corner;
          break;
        }
      }
    }

    if (!chosen) {
      let best: LabelCorner = CORNERS[0];
      let bestArea = Infinity;
      for (const corner of CORNERS) {
        const candidate = box(corner);
        // Sitting nearer another marker costs as much as covering the whole
        // label, so such a corner wins only when every corner is worse.
        const area =
          collisionArea(candidate, accepted, otherMarkers) +
          overflowArea(candidate, frame) +
          (nearerOtherMarker(candidate, ownMarker, otherMarkers)
            ? candidate.w * candidate.h
            : 0);
        if (area < bestArea) {
          bestArea = area;
          best = corner;
        }
      }
      chosen = best;
    }

    offsets.set(label.id, offsetFor(chosen, markerSize, label.w, label.h));
    corners.set(label.id, chosen);
    accepted.push(box(chosen));
  }

  return { offsets, corners };
}
