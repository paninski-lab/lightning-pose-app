export interface FFProbeInfo {
  file_path: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  format: string;
  size: number;
  codec: string;
  is_vfr: boolean;
  bitrate_str: string;
  dar: string;
  sar: string;
  color_space: string;
  is_all_intra: boolean;
}
