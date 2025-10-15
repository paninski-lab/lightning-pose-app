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
  csv_file: string;
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
  model_type: 'regression' | 'heatmap' | 'heatmap_mhcrnn';
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
export interface RootConfig {
  data: DataConfig;
  training: TrainingConfig;
  model: ModelConfig;
  dali: DaliConfig;
  losses: LossesConfig;
  eval: EvalConfig;
  callbacks: CallbacksConfig;
}

// --- Wrapper Classes with Utility Methods ---

/**
 * A generic base class to wrap a configuration object.
 */
class ConfigWrapper<T> {
  protected readonly _data: T;

  constructor(data: T) {
    this._data = data;
  }

  /**
   * Access the raw, unwrapped configuration object.
   */
  public get raw(): T {
    return this._data;
  }
}

// --- AI Generated utility wrappers.
// Methods are illustrative and to be replaced with actual utility methods. ---

class DataConfigWrapper extends ConfigWrapper<DataConfig> {
  /**
   * Calculates the aspect ratio of the resize dimensions.
   */
  public getAspectRatio(): number {
    const { width, height } = this._data.image_resize_dims;
    return height === 0 ? 0 : width / height;
  }

  /**
   * Checks if a given keypoint name is valid according to the config.
   */
  public hasKeypoint(name: string): boolean {
    return this._data.keypoint_names.includes(name);
  }
}

class TrainingConfigWrapper extends ConfigWrapper<TrainingConfig> {
  /**
   * Calculates the fraction of data used for testing, based on the
   * train and validation probabilities.
   */
  public getTestProb(): number {
    const testProb = 1 - this._data.train_prob - this._data.val_prob;
    // Ensure the result is non-negative and reasonably formatted
    return Math.max(0, parseFloat(testProb.toFixed(2)));
  }
}

class ModelConfigWrapper extends ConfigWrapper<ModelConfig> {}
class DaliConfigWrapper extends ConfigWrapper<DaliConfig> {}
class LossesConfigWrapper extends ConfigWrapper<LossesConfig> {}
class EvalConfigWrapper extends ConfigWrapper<EvalConfig> {}
class CallbacksConfigWrapper extends ConfigWrapper<CallbacksConfig> {}

/**
 * The main wrapper for the root configuration object. It provides
 * hierarchical access to wrapped sub-configurations.
 */
export class RootConfigWrapper extends ConfigWrapper<RootConfig> {
  // Cache wrapped instances to avoid re-creating them on every access
  private _dataWrapper?: DataConfigWrapper;
  private _trainingWrapper?: TrainingConfigWrapper;
  private _modelWrapper?: ModelConfigWrapper;
  private _daliWrapper?: DaliConfigWrapper;
  private _lossesWrapper?: LossesConfigWrapper;
  private _evalWrapper?: EvalConfigWrapper;
  private _callbacksWrapper?: CallbacksConfigWrapper;

  public get data(): DataConfigWrapper {
    if (!this._dataWrapper) {
      this._dataWrapper = new DataConfigWrapper(this._data.data);
    }
    return this._dataWrapper;
  }

  public get training(): TrainingConfigWrapper {
    if (!this._trainingWrapper) {
      this._trainingWrapper = new TrainingConfigWrapper(this._data.training);
    }
    return this._trainingWrapper;
  }

  public get model(): ModelConfigWrapper {
    if (!this._modelWrapper) {
      this._modelWrapper = new ModelConfigWrapper(this._data.model);
    }
    return this._modelWrapper;
  }

  public get dali(): DaliConfigWrapper {
    if (!this._daliWrapper) {
      this._daliWrapper = new DaliConfigWrapper(this._data.dali);
    }
    return this._daliWrapper;
  }

  public get losses(): LossesConfigWrapper {
    if (!this._lossesWrapper) {
      this._lossesWrapper = new LossesConfigWrapper(this._data.losses);
    }
    return this._lossesWrapper;
  }

  public get eval(): EvalConfigWrapper {
    if (!this._evalWrapper) {
      this._evalWrapper = new EvalConfigWrapper(this._data.eval);
    }
    return this._evalWrapper;
  }

  public get callbacks(): CallbacksConfigWrapper {
    if (!this._callbacksWrapper) {
      this._callbacksWrapper = new CallbacksConfigWrapper(this._data.callbacks);
    }
    return this._callbacksWrapper;
  }

  /**
   * Creates a unique identifier string for the model configuration.
   * @returns A string like "rebuttal23a-resnet50_animal_ap10k".
   */
  public getModelIdentifier(): string {
    return `${this._data.model.model_name}-${this._data.model.backbone}`;
  }
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
