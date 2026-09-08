export interface LiveStreamTrack {
  trackId: string;
  videoUrl: string;
  /** true when the track carries video (usually with paired audio); false for audio-only */
  isVideo: boolean;
}

export interface LiveStreamInfo {
  streamId: string;
  trackCount: number;
  tracks: LiveStreamTrack[];
  title: string;
  category: string;
  viewers: number;
  avatarUrl: string;
  thumbnailUrl: string;
}

export interface AvailableStreamsResponse {
  streams: LiveStreamInfo[];
  streamCount: number;
}
