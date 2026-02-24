/**
 * Represents the dimensions for image resizing.
 */
export interface ImageResizeDims {
  height: number;
  width: number;
}

/**
 * Configuration for data loading and processing.
 */
export interface DataConfig {
  image_resize_dims: ImageResizeDims;
  data_dir: string;
  video_dir: string;
  csv_file: string | string[];
  view_names?: string[];
  num_keypoints: number;
  keypoint_names: string[];
  mirrored_column_matches: number[][];
  columns_for_singleview_pca: number[];
}

/**
 * Parameters for the optimizer.
 */
export interface OptimizerParams {
  learning_rate: number;
}

/**
 * Parameters for the MultiStepLR learning rate scheduler.
 */
export interface MultiStepLRParams {
  milestones: number[];
  gamma: number;
}

/**
 * Container for learning rate scheduler parameters.
 */
export interface LRSchedulerParams {
  multisteplr: MultiStepLRParams;
}

/**
 * Configuration for the model training process.
 */
export interface TrainingConfig {
  imgaug: 'default' | 'dlc' | 'dlc-top-down';
  train_batch_size: number;
  val_batch_size: number;
  test_batch_size: number;
  train_prob: number;
  val_prob: number;
  train_frames: number;
  num_gpus: number;
  early_stop_patience: number;
  unfreezing_epoch: number;
  min_epochs: number;
  max_epochs: number;
  log_every_n_steps: number;
  check_val_every_n_epoch: number;
  rng_seed_data_pt: number;
  rng_seed_model_pt: number;
  optimizer: 'Adam' | 'AdamW';
  optimizer_params: OptimizerParams;
  lr_scheduler: 'multisteplr';
  lr_scheduler_params: LRSchedulerParams;
}

/**
 * Configuration for the model architecture and losses.
 */
export interface ModelConfig {
  losses_to_use: string[];
  backbone: string;
  model_type:
    | 'regression'
    | 'heatmap'
    | 'heatmap_mhcrnn'
    | 'heatmap_multiview_transformer';
  heatmap_loss_type: 'mse';
  model_name: string;
}

export const backbones = [
  'resnet18',
  'resnet34',
  'resnet50',
  'resnet101',
  'resnet152',
  'resnet50_contrastive',
  'resnet50_animal_apose',
  'resnet50_animal_ap10k',
  'resnet50_human_jhmdb',
  'resnet50_human_res_rle',
  'resnet50_human_top_res',
  'resnet50_human_hand',
  'efficientnet_b0',
  'efficientnet_b1',
  'efficientnet_b2',
  'vits_dino',
  'vitb_dino',
  'vitb_imagenet',
  'vitb_sam',
];
// Only vit backbones are supported for true multiview models.
export const validMvBackbones = backbones.filter((b) => b.startsWith('vit'));

/**
 * Configuration for DALI data loader pipelines.
 */
export interface DaliConfig {
  base: {
    train: {
      sequence_length: number;
    };
    predict: {
      sequence_length: number;
    };
  };
  context: {
    train: {
      batch_size: number;
    };
    predict: {
      sequence_length: number;
    };
  };
}

/**
 * Configuration for PCA-based losses.
 */
export interface PcaLossConfig {
  log_weight: number;
  components_to_keep: number;
  epsilon: number | null;
}

/**
 * Configuration for the temporal loss function.
 */
export interface TemporalLossConfig {
  log_weight: number;
  epsilon: number;
  prob_threshold: number;
}

/**
 * Container for all loss function configurations.
 */
export interface LossesConfig {
  pca_multiview: PcaLossConfig;
  pca_singleview: PcaLossConfig;
  temporal: TemporalLossConfig;
}

/**
 * Configuration for FiftyOne visualization tool.
 */
export interface FiftyOneConfig {
  dataset_name: string;
  model_display_names: string[];
  launch_app_from_script: boolean;
  remote: boolean;
  address: string;
  port: number;
}

/**
 * Configuration for model evaluation and prediction.
 */
export interface EvalConfig {
  hydra_paths: string[];
  predict_vids_after_training: boolean;
  save_vids_after_training: boolean;
  fiftyone: FiftyOneConfig;
  test_videos_directory: string;
  confidence_thresh_for_vid: number;
}

/**
 * Configuration for the weight annealing callback.
 */
export interface AnnealWeightCallback {
  attr_name: string;
  init_val: number;
  increase_factor: number;
  final_val: number;
  freeze_until_epoch: number;
}

/**
 * Container for all callback configurations.
 */
export interface CallbacksConfig {
  anneal_weight: AnnealWeightCallback;
}

/**
 * The root interface for the entire configuration file.
 */
export interface ModelConfig {
  data: DataConfig;
  training: TrainingConfig;
  model: ModelConfig;
  dali: DaliConfig;
  losses: LossesConfig;
  eval: EvalConfig;
  callbacks: CallbacksConfig;
}

export enum ModelType {
  SUP = 'SUP',
  S_SUP = 'S_SUP',
  SUP_CTX = 'SUP_CTX',
  S_SUP_CTX = 'S_SUP_CTX',
}
export const modelTypeLabels: Record<ModelType, string> = {
  [ModelType.SUP]: 'Supervised',
  [ModelType.S_SUP]: 'Semi-supervised',
  [ModelType.SUP_CTX]: 'Supervised Context',
  [ModelType.S_SUP_CTX]: 'Semi-supervised Context',
};
export function isUnsupervised(value: ModelType) {
  return value === ModelType.S_SUP || value === ModelType.S_SUP_CTX;
}

export const validMvModelTypes = [ModelType.SUP];

export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

export interface TrainStatus {
  status:
    | 'PENDING'
    | 'STARTING'
    | 'STARTED'
    | 'TRAINING'
    | 'EVALUATING'
    | 'COMPLETED'
    | 'FAILED'
    | 'CANCELED'
    | 'PAUSED';
  pid?: number | null;
}

export interface ModelListResponseEntry {
  model_name: string;
  model_relative_path: string;
  config?: ModelConfig;
  status?: TrainStatus;
}

export interface ModelListResponse {
  models: ModelListResponseEntry[];
}

export class mc_util {
  constructor(private m: ModelListResponseEntry) {}
  get c() {
    return this.m.config;
  }
  get type() {
    if ((this.c!.model.losses_to_use?.length ?? 0) > 0) {
      return this.c!.model.model_type.endsWith('mhcrnn')
        ? ModelType.S_SUP_CTX
        : ModelType.S_SUP;
    } else {
      return this.c!.model.model_type.endsWith('mhcrnn')
        ? ModelType.SUP_CTX
        : ModelType.SUP;
    }
  }
  get createdAt(): string | undefined {
    return (this.c as any)?.creation_datetime;
  }
  get status(): string {
    return this.m.status?.status ?? '';
  }
}
