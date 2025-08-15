import logging
from pathlib import Path

import cv2
import numpy as np
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from tqdm import tqdm

from litpose_app.config import Config
from litpose_app.utils.video import video_capture

logger = logging.getLogger(__name__)


def frame_selection_kmeans_impl(
    config: Config,
    video_path: Path,
    n_frames: int,
    beg_frame: int = 0,
    end_frame: int | None = None,
) -> list[int]:
    """
    Reads all frames, computes motion energy, clusters into n_frames clusters
    and picks a frame out of each cluster.
    """

    # read all frames, reshape, chop off unwanted portions of beginning/end
    frames = _read_all_frames(
        config=config,
        video_file=video_path,
    )
    frame_count = frames.shape[0]
    beg_frame = 0
    # leave room for context
    end_frame = (
        frame_count - config.FRAME_EXTRACT_N_CONTEXT_FRAMES
        if end_frame is None
        else end_frame
    )
    end_frame = max(beg_frame, end_frame)
    """
    beg_frame = int(float(frame_range[0]) * frame_count)
    end_frame = int(float(frame_range[1]) * frame_count) - 2  # leave room for context
    """
    batches = np.reshape(frames, (frames.shape[0], -1))[beg_frame:end_frame]

    # take temporal diffs
    logger.info("Computing motion energy")
    me = np.concatenate([np.zeros((1, batches.shape[1])), np.diff(batches, axis=0)])
    # take absolute values and sum over all pixels to get motion energy
    me = np.sum(np.abs(me), axis=1)

    # find high me frames, defined as those with me larger than nth percentile me
    prctile = 50 if frame_count < 1e5 else 75  # take fewer frames if there are many
    idxs_high_me = np.where(me > np.percentile(me, prctile))[0]
    # just use all frames if the user wants to label a large fraction of the frames
    # (helpful for very short videos)
    if len(idxs_high_me) < n_frames:
        idxs_high_me = np.arange(me.shape[0])

    # compute pca over high me frames
    logger.info("performing pca over high motion energy frames...")
    pca_obj = PCA(n_components=np.min([batches[idxs_high_me].shape[0], 32]))
    embedding = pca_obj.fit_transform(X=batches[idxs_high_me])
    del batches  # free up memory

    # cluster low-d pca embeddings
    logger.info("performing kmeans clustering...")
    _, centers = _run_kmeans(x=embedding, n_clusters=n_frames)
    # centers is initially of shape (n_clusters, n_pcs); reformat
    centers = centers.T[None, :]

    # find high me frame that is closest to each cluster center
    # embedding is shape (n_frames, n_pcs)
    # centers is shape (1, n_pcs, n_clusters)
    dists = np.linalg.norm(embedding[:, :, None] - centers, axis=1)
    # dists is shape (n_frames, n_clusters)
    idxs_prototypes_ = np.argmin(dists, axis=0)
    # now index into high me frames to get overall indices, add offset
    idxs_prototypes = idxs_high_me[idxs_prototypes_] + beg_frame

    return idxs_prototypes


def _read_all_frames(config, video_file):
    return _read_nth_frames(config=config, video_file=video_file, n=1)


def _read_nth_frames(
    config: Config,
    video_file: Path,
    n: int = 1,
) -> np.ndarray:

    # Open the video file
    with video_capture(video_file) as cap:
        frames = []
        frame_counter = 0
        frame_total = cap.get(cv2.CAP_PROP_FRAME_COUNT)
        with tqdm(total=int(frame_total)) as pbar:
            while cap.isOpened():
                # Read the next frame
                ret, frame = cap.read()
                if ret:
                    # If the frame was successfully read, then process it
                    if frame_counter % n == 0:
                        frame_resize = cv2.resize(
                            frame,
                            (
                                config.FRAME_EXTRACT_RESIZE_DIMS,
                                config.FRAME_EXTRACT_RESIZE_DIMS,
                            ),
                        )
                        frame_gray = cv2.cvtColor(frame_resize, cv2.COLOR_BGR2RGB)
                        frames.append(frame_gray.astype(np.float16))
                    frame_counter += 1
                    progress = frame_counter / frame_total * 100.0
                    # TODO progress update
                    pbar.update(1)
                else:
                    # If we couldn't read a frame, we've probably reached the end
                    break

        return np.array(frames)


def _run_kmeans(x: np.ndarray, n_clusters: int) -> tuple:
    kmeans_obj = KMeans(n_clusters, n_init="auto")
    kmeans_obj.fit(x)
    cluster_labels = kmeans_obj.labels_
    cluster_centers = kmeans_obj.cluster_centers_
    return cluster_labels, cluster_centers
