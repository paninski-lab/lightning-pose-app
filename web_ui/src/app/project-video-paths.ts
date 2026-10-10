/** Playable sessions: mp4 files under a data-dir folder whose name starts with "videos". */
export const PROJECT_VIDEO_MP4_GLOB = 'videos*/**/*.mp4';

/** Every file under those folders. The videos panel filters extensions itself. */
export const PROJECT_VIDEO_TREE_GLOB = 'videos*/**/*';

/** True when `name` is a data-directory folder the app treats as videos. */
export function isProjectVideoDir(name: string | undefined): boolean {
  return !!name && name.startsWith('videos');
}
