import {
  clampSkeletonThickness,
  DEFAULT_SKELETON_THICKNESS,
} from './skeleton-validity';

export function storedNumber(key: string, fallback: number): number {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export function storedSkeletonThickness(key: string): number {
  return clampSkeletonThickness(
    storedNumber(key, DEFAULT_SKELETON_THICKNESS),
  );
}

export function storedFlag(key: string, fallback: boolean): boolean {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === 'true';
}
