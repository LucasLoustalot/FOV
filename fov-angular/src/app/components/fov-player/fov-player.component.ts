import {
  Component,
  Input,
  AfterViewInit,
  OnDestroy,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import Hls from 'hls.js';
import { environment } from '../../../environments/environment';

export interface Track {
  index: number;
  name: string;
  videoUrl: string;
  /** true = video track (with paired audio when available); false = audio-only */
  isVideo: boolean;
}

export interface VideoWrapper {
  playerId: string;
  track: Track;
  x: number;
  y: number;
  width: number;
  height: number;
  hls: Hls | null;
  videoElement: HTMLVideoElement | null;
  visible: boolean;
  zIndex: number;
  volume: number;
  aspectRatio: number;
  isReady: boolean;
  hasManifest: boolean;
  bufferEnd: number;
  bufferStart: number;
  isVideo: boolean;
}

interface ApiTracksResponse {
  tracks: Track[];
  videoCount: number;
  ready: boolean;
  pending?: number;
  totalDirs?: number;
  message?: string;
}

interface ApiStreamTrack {
  trackId: string;
  videoUrl: string;
  /** true = video track (with paired audio when available); false = audio-only */
  isVideo?: boolean;
}

interface ApiLiveStream {
  streamId: string;
  trackCount: number;
  tracks: ApiStreamTrack[];
}

interface ApiAvailableStreamsResponse {
  streams: ApiLiveStream[];
  streamCount: number;
}

@Component({
  selector: 'app-fov-player',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './fov-player.component.html',
  styleUrls: ['./fov-player.component.scss'],
})
export class FovPlayerComponent implements AfterViewInit, OnDestroy {
  @Input() streamId: string = '';

  videoWrappers: VideoWrapper[] = [];
  availableTracks: Track[] = [];
  editMode = false;
  isLoading = true;
  errorMessage = '';

  isBufferingPhase = true;

  activeDragWrapper: VideoWrapper | null = null;
  activeResizeWrapper: VideoWrapper | null = null;
  dragStartX = 0;
  dragStartY = 0;
  initialX = 0;
  initialY = 0;
  initialW = 0;
  initialH = 0;

  syncStats: Map<string, number> = new Map();
  maxDrift = 0;

  playbackStarted = false;

  private masterPlayerId: string | null = null;
  private syncInterval: any = null;
  private pollingInterval: any = null;
  private bufferCheckInterval: any = null;
  private trackIdCounter = 0;
  private originalTrackOrder: string[] = [];

  private readonly SYNC_THRESHOLD = 0.1;
  private readonly HARD_SYNC_THRESHOLD = 0.3;
  private readonly MIN_BUFFER_FOR_START = 6;
  private readonly MIN_COMMON_RANGE = 4;
  private readonly MIN_FORWARD_BUFFER = 3;
  private readonly SAFE_POSITION_MARGIN = 0.5;

  private readonly MAX_WIDTH_RATIO = 0.8;
  private readonly API_URL = environment.apiUrl;
  private readonly MAX_POLL_ATTEMPTS = 60;
  private pollAttempts = 0;
  private isInitialized = false;
  private audioUnlocked = false;
  private readonly MOBILE_BREAKPOINT = 768;

  readonly playerId = `fov_${Math.random().toString(36).substr(2, 9)}`;

  constructor(private http: HttpClient) {}

  getLoadingMessage(): string {
    if (this.errorMessage) return '';
    if (this.isLoading && !this.isBufferingPhase)
      return 'Connexion au serveur...';
    return 'Chargement du live...';
  }

  ngAfterViewInit() {
    setTimeout(() => {
      if (!this.isInitialized) {
        this.isInitialized = true;
        this.loadTracks();
      }
    }, 100);
  }

  ngOnDestroy() {
    this.stopSyncMonitoring();
    this.stopPolling();
    this.stopBufferCheck();
    this.videoWrappers.forEach((w) => w.hls?.destroy());
  }

  private isMobileLayout(): boolean {
    return window.innerWidth <= this.MOBILE_BREAKPOINT;
  }

  private getFittedSize(
    stageW: number,
    stageH: number,
    aspectRatio: number,
    fillRatio: number = 0.95,
  ) {
    const maxW = stageW * fillRatio;
    const maxH = stageH * fillRatio;

    let width = maxW;
    let height = width / aspectRatio;

    if (height > maxH) {
      height = maxH;
      width = height * aspectRatio;
    }

    return { width, height };
  }

  private clampWrapperToStage(wrapper: VideoWrapper) {
    const stage = this.getStageElement();
    if (!stage) return;

    const maxX = Math.max(0, stage.offsetWidth - wrapper.width);
    const maxY = Math.max(0, stage.offsetHeight - wrapper.height);

    wrapper.x = Math.max(0, Math.min(wrapper.x, maxX));
    wrapper.y = Math.max(0, Math.min(wrapper.y, maxY));
  }

  private loadTracks() {
    if (this.playbackStarted || this.videoWrappers.length > 0) {
      console.warn('[loadTracks] Already initialized, skipping');
      return;
    }
    this.isLoading = true;
    this.isBufferingPhase = true;
    this.playbackStarted = false;
    this.errorMessage = '';
    this.fetchAvailableTracks();
  }

  private adaptWrappersToViewport() {
    const stage = this.getStageElement();
    if (!stage || this.videoWrappers.length === 0) return;

    const stageW = stage.offsetWidth;
    const stageH = stage.offsetHeight;

    if (this.isMobileLayout()) {
      const main = this.videoWrappers.find(w => w.isVideo);
      if (!main) return;
      const mainAspect = main.aspectRatio || 16 / 9;
      const mainFitted = this.getFittedSize(stageW, stageH * 0.68, mainAspect, 0.96);

      main.width = mainFitted.width;
      main.height = mainFitted.height;
      main.x = (stageW - main.width) / 2;
      main.y = 8;

      let currentX = 8;
      let currentY = main.y + main.height + 8;
      const thumbHeight = Math.min(90, stageH * 0.16);

      for (let i = 1; i < this.videoWrappers.length; i++) {
        const wrapper = this.videoWrappers[i];
        if (!wrapper.isVideo) continue;

        const ratio = wrapper.aspectRatio || 16 / 9;
        wrapper.height = thumbHeight;
        wrapper.width = wrapper.height * ratio;

        if (currentX + wrapper.width > stageW - 8) {
          currentX = 8;
          currentY += thumbHeight + 8;
        }

        wrapper.x = currentX;
        wrapper.y = currentY;
        currentX += wrapper.width + 8;
        this.clampWrapperToStage(wrapper);
      }
    } else {
      this.videoWrappers.forEach((wrapper, index) => {
        if (!wrapper.isVideo) return;

        const ratio = wrapper.aspectRatio || 16 / 9;
        const fitted = this.getFittedSize(
          stageW,
          stageH,
          ratio,
          index === 0 ? 1 : this.MAX_WIDTH_RATIO,
        );

        if (wrapper.width > fitted.width) {
          wrapper.width = fitted.width;
          wrapper.height = wrapper.width / ratio;
        }

        if (wrapper.height > fitted.height) {
          wrapper.height = fitted.height;
          wrapper.width = wrapper.height * ratio;
        }

        this.clampWrapperToStage(wrapper);
      });
    }
  }

  @HostListener('window:resize')
  onWindowResize() {
    setTimeout(() => this.adaptWrappersToViewport(), 0);
  }

  @HostListener('window:orientationchange')
  onOrientationChange() {
    setTimeout(() => this.adaptWrappersToViewport(), 200);
  }

  private fetchAvailableTracks() {
    this.http.get<any>(`${this.API_URL}/streams/available`).subscribe({
      next: (response) => {
        console.log('[loadTracks] API response:', response);
        if (Array.isArray(response)) {
          this.handleArrayApiFormat(response);
        } else if (response.streams) {
          this.handleNewApiFormat(response as ApiAvailableStreamsResponse);
        } else if (response.tracks) {
          this.handleLegacyApiFormat(response as ApiTracksResponse);
        } else {
          this.handleNoData();
        }
      },
      error: (err) => {
        console.error('Erreur chargement des tracks:', err);
        this.pollAttempts++;
        if (this.pollAttempts < this.MAX_POLL_ATTEMPTS) {
          this.startPolling(2000);
        } else {
          this.isLoading = false;
          this.isBufferingPhase = false;
          this.errorMessage = 'Impossible de charger les flux.';
        }
      },
    });
  }

  private handleArrayApiFormat(streams: any[]) {
    const stream = streams.find((s) => s.streamId === this.streamId);

    if (stream && stream.tracks && stream.tracks.length > 0) {
      this.stopPolling();
      this.availableTracks = stream.tracks.map((t: any, i: number) => ({
        index: i,
        name: t.trackId,
        videoUrl: t.videoUrl,
        isVideo: t.isVideo ?? true,
      }));
      console.log(
        `[loadTracks] Stream "${this.streamId}" found with ${this.availableTracks.length} tracks`,
      );
      this.initializeAllTracks();
      this.isLoading = false;
    } else {
      this.handleNoData();
    }
  }

  private handleNewApiFormat(response: ApiAvailableStreamsResponse) {
    const stream = response.streams.find((s) => s.streamId === this.streamId);

    if (stream && stream.tracks.length > 0) {
      this.stopPolling();
      this.availableTracks = stream.tracks.map((t, i) => ({
        index: i,
        name: t.trackId,
        videoUrl: t.videoUrl,
        isVideo: t.isVideo ?? true,
      }));
      console.log(
        `[loadTracks] Stream "${this.streamId}" found with ${this.availableTracks.length} tracks`,
      );
      this.initializeAllTracks();
      this.isLoading = false;
    } else {
      this.handleNoData();
    }
  }

  private handleLegacyApiFormat(response: ApiTracksResponse) {
    const totalDirs = response.totalDirs || 0;
    const readyCount = response.videoCount || 0;
    const pending = response.pending || 0;
    const allReady = totalDirs > 0 && pending === 0 && readyCount === totalDirs;

    if (allReady && response.tracks && response.tracks.length > 0) {
      this.stopPolling();
      this.availableTracks = response.tracks;
      this.initializeAllTracks();
      this.isLoading = false;
    } else {
      this.pollAttempts++;
      if (this.pollAttempts < this.MAX_POLL_ATTEMPTS) {
        let pollDelay: number;
        if (pending > 0 && readyCount > 0) {
          pollDelay = 500;
        } else if (totalDirs > 0) {
          pollDelay = 1000;
        } else {
          pollDelay = 2000;
        }
        this.startPolling(pollDelay);
      } else {
        this.isLoading = false;
        this.isBufferingPhase = false;
        this.errorMessage = 'Timeout.';
      }
    }
  }

  private handleNoData() {
    this.pollAttempts++;
    if (this.pollAttempts < this.MAX_POLL_ATTEMPTS) {
      this.startPolling(2000);
    } else {
      this.isLoading = false;
      this.isBufferingPhase = false;
      this.errorMessage = 'Timeout: les flux ne sont pas disponibles.';
    }
  }

  private startPolling(delay: number = 2000) {
    this.stopPolling();
    this.pollingInterval = setTimeout(() => {
      this.fetchAvailableTracks();
    }, delay);
  }

  private stopPolling() {
    if (this.pollingInterval) {
      clearTimeout(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  private initializeAllTracks() {
    if (this.videoWrappers.length > 0) {
      console.warn(
        '[initializeAllTracks] Destroying existing players before reinit',
      );
      this.videoWrappers.forEach((w) => {
        if (w.hls) {
          w.hls.destroy();
          w.hls = null;
        }
      });
      this.videoWrappers = [];
    }

    this.originalTrackOrder = this.availableTracks.map((t) => t.name);
    this.playbackStarted = false;
    this.isBufferingPhase = true;

    const stagger = this.availableTracks.length <= 2 ? 200 : 100;

    this.availableTracks.forEach((track, index) => {
      setTimeout(() => this.addTrack(track), index * stagger);
    });

    const totalStagger = this.availableTracks.length * stagger;
    setTimeout(() => this.startBufferCheck(), totalStagger + 500);
  }

  private getStageElement(): HTMLElement | null {
    return document.getElementById(`stageArea_${this.playerId}`);
  }

  private addTrack(track: Track) {
    const uniqueId = this.trackIdCounter++;
    const trackCopy: Track = {
      ...track,
      index: uniqueId,
      name: `${track.name}`,
    };

    const stage = this.getStageElement();
    const stageW = stage ? stage.offsetWidth : 800;
    const stageH = stage ? stage.offsetHeight : 450;

    const isFirst = this.videoWrappers.length === 0;
    const initialAspectRatio = 16 / 9;

    let initialWidth: number;
    let initialHeight: number;
    let initialX: number;
    let initialY: number;

    if (isFirst) {
      if (this.isMobileLayout()) {
        const fitted = this.getFittedSize(stageW, stageH * 0.68, initialAspectRatio, 0.96);
        initialWidth = fitted.width;
        initialHeight = fitted.height;
        initialX = (stageW - initialWidth) / 2;
        initialY = 8;
      } else {
        initialWidth = stageW;
        initialHeight = initialWidth / initialAspectRatio;
        initialX = 0;
        initialY = 0;
      }
    } else {
      if (this.isMobileLayout()) {
        initialHeight = Math.min(90, stageH * 0.16);
        initialWidth = initialHeight / (1 / initialAspectRatio);
        initialX = 8;
        initialY = Math.min(stageH - initialHeight - 8, 20 + (this.videoWrappers.length - 1) * 20);
      } else {
        initialWidth = 300;
        initialHeight = initialWidth / initialAspectRatio;
        initialX = 20;
        initialY = 20 + (this.videoWrappers.length - 1) * 20;
      }
    }

    if (!track.isVideo) {
      initialWidth = 0;
      initialHeight = 0;
      initialX = 0;
      initialY = 0;
    }

    const newWrapper: VideoWrapper = {
      playerId: `player_${this.playerId}_${trackCopy.index}`,
      track: trackCopy,
      x: initialX,
      y: initialY,
      width: initialWidth,
      height: initialHeight,
      hls: null,
      videoElement: null,
      visible: true,
      zIndex: 100,
      volume: 1,
      aspectRatio: initialAspectRatio,
      isReady: false,
      hasManifest: false,
      bufferEnd: 0,
      bufferStart: 0,
      isVideo: track.isVideo,
    };

    this.videoWrappers.push(newWrapper);

    setTimeout(() => {
      this.initHlsForWrapper(newWrapper, track.videoUrl);
      this.refreshLayoutState();
      this.adaptWrappersToViewport();
    }, 100);
  }

  removeTrack(wrapper: VideoWrapper) {
    if (!this.editMode) return;
    if (this.videoWrappers.length <= 1) return;

    const wasMaster = wrapper.playerId === this.masterPlayerId;
    if (wrapper.hls) wrapper.hls.destroy();
    this.videoWrappers = this.videoWrappers.filter((w) => w !== wrapper);
    this.syncStats.delete(wrapper.track.name);

    setTimeout(() => {
      this.refreshLayoutState();
      if (this.videoWrappers.length > 0) {
        const newMaster = this.videoWrappers[0];
        this.masterPlayerId = newMaster.playerId;
        this.setupMasterListeners();
        if (wasMaster) {
          this.syncStats.clear();
          this.maxDrift = 0;
        }
      }
    }, 50);
  }

  private initHlsForWrapper(wrapper: VideoWrapper, videoUrl: string, attempt = 0) {
    const videoEl = document.getElementById(
      `videoElement_${this.playerId}_${wrapper.track.index}`,
    ) as HTMLVideoElement;

    if (!videoEl) {
      if (attempt < 20) {
        setTimeout(() => this.initHlsForWrapper(wrapper, videoUrl, attempt + 1), 50);
      } else {
        console.error(`[${wrapper.track.name}] Video element not found`);
      }
      return;
    }

    wrapper.videoElement = videoEl;
    wrapper.isReady = false;
    wrapper.hasManifest = false;

    const isMaster = this.videoWrappers[0] === wrapper;

    videoEl.onloadedmetadata = () => {
      if (videoEl.videoWidth && videoEl.videoHeight) {
        wrapper.aspectRatio = videoEl.videoWidth / videoEl.videoHeight;
        wrapper.height = wrapper.width / wrapper.aspectRatio;

        const stage = this.getStageElement();
        if (stage) {
          const maxWidth = stage.offsetWidth * this.MAX_WIDTH_RATIO;
          const maxHeight = stage.offsetHeight * this.MAX_WIDTH_RATIO;
          if (wrapper.width > maxWidth) {
            wrapper.width = maxWidth;
            wrapper.height = wrapper.width / wrapper.aspectRatio;
          }
          if (wrapper.height > maxHeight) {
            wrapper.height = maxHeight;
            wrapper.width = wrapper.height * wrapper.aspectRatio;
          }
        }
      }

      setTimeout(() => this.adaptWrappersToViewport(), 0);
    };

    videoEl.volume = wrapper.volume;
    videoEl.muted = true;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,

        liveSyncDuration: 10,
        liveMaxLatencyDuration: 30,
        liveDurationInfinity: true,
        liveBackBufferLength: 30,

        maxBufferLength: 60,
        maxMaxBufferLength: 90,
        maxBufferSize: 200 * 1000 * 1000,
        maxBufferHole: 0.5,

        fragLoadingMaxRetry: 10,
        fragLoadingRetryDelay: 1000,
        fragLoadingMaxRetryTimeout: 20000,

        manifestLoadingMaxRetry: 10,
        manifestLoadingRetryDelay: 1000,
        levelLoadingMaxRetry: 10,
        levelLoadingRetryDelay: 1000,

        nudgeOffset: 0.1,
        nudgeMaxRetry: 10,
        maxFragLookUpTolerance: 0.25,

        startPosition: -1,
        startFragPrefetch: true,

        xhrSetup: (xhr: XMLHttpRequest, url: string) => {
          if (url.endsWith('.m3u8')) {
            const separator = url.includes('?') ? '&' : '?';
            xhr.open('GET', `${url}${separator}_t=${Date.now()}`, true);
          }
          xhr.setRequestHeader('Cache-Control', 'no-cache');
        },
      });

      wrapper.hls = hls;

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
          if (this.isBufferingPhase) {
            return;
          }
          console.warn(
            `[HLS ${wrapper.track.name}] bufferStalledError — forward buffer: ${this.getForwardBuffer(wrapper).toFixed(1)}s`,
          );
          return;
        }

        if (data.fatal) {
          console.error(
            `[HLS ${wrapper.track.name}] ${data.type}: ${data.details}`,
          );
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setTimeout(() => {
                if (wrapper.hls) wrapper.hls.startLoad();
              }, 2000);
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              this.reloadWrapper(wrapper);
              break;
          }
        }
      });

      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        this.updateBufferInfo(wrapper);
        if (!wrapper.isReady) {
          wrapper.isReady = true;
          console.log(`[${wrapper.track.name}] Ready (buffering...)`);
        }
      });

      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        console.log(
          `[${wrapper.track.name}] Manifest parsed, ${data.levels.length} levels`,
        );
        wrapper.hasManifest = true;
        videoEl.pause();
      });

      hls.loadSource(videoUrl);
      hls.attachMedia(videoEl);
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      videoEl.src = videoUrl;
      wrapper.isReady = true;
      wrapper.hasManifest = true;
    }

    if (isMaster) {
      this.masterPlayerId = wrapper.playerId;
      this.setupMasterListeners();
    }
  }

  private getForwardBuffer(wrapper: VideoWrapper): number {
    if (!wrapper.videoElement) return 0;
    const currentTime = wrapper.videoElement.currentTime;
    return wrapper.bufferEnd - currentTime;
  }

  private updateBufferInfo(wrapper: VideoWrapper) {
    if (!wrapper.videoElement) return;
    const videoEl = wrapper.videoElement;
    if (videoEl.buffered.length > 0) {
      wrapper.bufferStart = videoEl.buffered.start(0);
      wrapper.bufferEnd = videoEl.buffered.end(videoEl.buffered.length - 1);
    }
  }

  private startBufferCheck() {
    this.stopBufferCheck();
    this.bufferCheckInterval = setInterval(() => {
      this.checkBuffersAndStartPlayback();
    }, 500);
  }

  private stopBufferCheck() {
    if (this.bufferCheckInterval) {
      clearInterval(this.bufferCheckInterval);
      this.bufferCheckInterval = null;
    }
  }

  private checkBuffersAndStartPlayback() {
    if (!this.isBufferingPhase || this.playbackStarted) return;
    if (this.videoWrappers.length !== this.availableTracks.length) return;

    const allHaveManifest = this.videoWrappers.every((w) => w.hasManifest);
    if (!allHaveManifest) {
      return;
    }

    this.videoWrappers.forEach((w) => this.updateBufferInfo(w));

    const bufferLengths = this.videoWrappers.map(
      (w) => w.bufferEnd - w.bufferStart,
    );
    const minBuffer = Math.min(...bufferLengths);
    const bufferStatus = this.videoWrappers
      .map(
        (w) =>
          `${w.track.name}: ${(w.bufferEnd - w.bufferStart).toFixed(1)}s [${w.bufferStart.toFixed(1)}-${w.bufferEnd.toFixed(1)}]`,
      )
      .join(', ');
    console.log(
      `[Buffer] ${bufferStatus} (need ${this.MIN_BUFFER_FOR_START}s total, ${this.MIN_FORWARD_BUFFER}s forward)`,
    );

    if (minBuffer < this.MIN_BUFFER_FOR_START) {
      return;
    }

    let commonStart = 0;
    let commonEnd = Infinity;

    this.videoWrappers.forEach((w) => {
      commonStart = Math.max(commonStart, w.bufferStart);
      commonEnd = Math.min(commonEnd, w.bufferEnd);
    });

    const commonRange = commonEnd - commonStart;
    if (commonRange < this.MIN_COMMON_RANGE) {
      console.log(
        `[Buffer] Common range too small: ${commonRange.toFixed(1)}s`,
      );
      return;
    }

    const startPosition = commonStart + this.SAFE_POSITION_MARGIN;
    const forwardBuffer = commonEnd - startPosition;

    if (forwardBuffer < this.MIN_FORWARD_BUFFER) {
      const progress = Math.min(
        100,
        (forwardBuffer / this.MIN_FORWARD_BUFFER) * 100,
      );
      console.log(
        `[Buffer] Forward buffer: ${forwardBuffer.toFixed(1)}s / ${this.MIN_FORWARD_BUFFER}s (${progress.toFixed(0)}%)`,
      );
      return;
    }

    console.log(`[Buffer] ✅ Ready!`);
    console.log(
      `[Buffer]   Common range: ${commonStart.toFixed(1)}s - ${commonEnd.toFixed(1)}s (${commonRange.toFixed(1)}s)`,
    );
    console.log(`[Buffer]   Start position: ${startPosition.toFixed(2)}s`);
    console.log(`[Buffer]   Forward buffer: ${forwardBuffer.toFixed(1)}s`);

    this.stopBufferCheck();
    this.startSynchronizedPlayback(startPosition);
  }

  private async startSynchronizedPlayback(startPosition: number) {
    console.log(
      `[Sync] Starting synchronized playback at ${startPosition.toFixed(2)}s`,
    );

    for (const w of this.videoWrappers) {
      if (w.videoElement) w.videoElement.pause();
    }

    const seekPromises = this.videoWrappers.map((w) => {
      return new Promise<void>((resolve) => {
        if (!w.videoElement) {
          resolve();
          return;
        }

        const onSeeked = () => {
          w.videoElement!.removeEventListener('seeked', onSeeked);
          console.log(
            `[${w.track.name}] Seeked to ${startPosition.toFixed(2)}s, forward buffer: ${(w.bufferEnd - startPosition).toFixed(1)}s`,
          );
          resolve();
        };

        w.videoElement.addEventListener('seeked', onSeeked);
        w.videoElement.currentTime = startPosition;
      });
    });

    await Promise.all(seekPromises);
    console.log('[Sync] All players seeked');

    await this.waitForAllReady();
    console.log('[Sync] All players ready');

    await this.playAllWrappers();

    requestAnimationFrame(() => {
      console.log('[Sync] Starting playback NOW');

      this.playbackStarted = true;
      this.isBufferingPhase = false;

      for (const w of this.videoWrappers) {
        this.updateBufferInfo(w);
        const fwd = this.getForwardBuffer(w);
        console.log(
          `[Sync] ${w.track.name} forward buffer at play: ${fwd.toFixed(1)}s`,
        );
      }

      console.log('[Sync] ✅ Playback started!');
      this.startSyncMonitoring();
    });
  }

  private waitForAllReady(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        const allReady = this.videoWrappers.every(
          (w) => w.videoElement && w.videoElement.readyState >= 3,
        );
        if (allReady) {
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
  }

  private reloadWrapper(wrapper: VideoWrapper) {
    console.log(`[${wrapper.track.name}] Reloading wrapper...`);
    wrapper.isReady = false;
    wrapper.hasManifest = false;

    if (wrapper.hls) {
      wrapper.hls.destroy();
      wrapper.hls = null;
    }

    setTimeout(() => {
      this.initHlsForWrapper(wrapper, wrapper.track.videoUrl);
    }, 3000);
  }

  private syncAllToMaster() {
    if (this.videoWrappers.length < 2) return;
    if (!this.playbackStarted) return;

    const master = this.videoWrappers.find(w => w.playerId === this.masterPlayerId);
    if (!master || !master.isVideo || !master.videoElement) return;
    if (master.videoElement.paused || master.videoElement.readyState < 3) return;

    const masterTime = master.videoElement.currentTime;
    this.maxDrift = 0;

    this.videoWrappers.forEach((w) => this.updateBufferInfo(w));

    this.videoWrappers.forEach((w, i) => {
      if (i === 0 || !w.videoElement) return;
      if (w.videoElement.paused || w.videoElement.seeking) return;
      if (w.videoElement.readyState < 3) return;

      const drift = w.videoElement.currentTime - masterTime;
      const absDrift = Math.abs(drift);

      this.syncStats.set(w.track.name, drift * 1000);
      if (absDrift > this.maxDrift) this.maxDrift = absDrift;

      if (absDrift > this.HARD_SYNC_THRESHOLD) {
        if (masterTime >= w.bufferStart && masterTime <= w.bufferEnd) {
          console.warn(
            `[${w.track.name}] Hard resync: ${(drift * 1000).toFixed(0)}ms`,
          );
          w.videoElement.currentTime = masterTime;
          w.videoElement.playbackRate = 1;
        } else {
          const correction = drift > 0 ? 0.95 : 1.05;
          w.videoElement.playbackRate = correction;
        }
      } else if (absDrift > this.SYNC_THRESHOLD) {
        const correction = drift > 0 ? 0.98 : 1.02;
        w.videoElement.playbackRate = correction;
      } else {
        if (w.videoElement.playbackRate !== 1) {
          w.videoElement.playbackRate = 1;
        }
      }
    });
  }

  startSyncMonitoring() {
    this.stopSyncMonitoring();
    this.syncInterval = setInterval(() => this.syncAllToMaster(), 500);
  }

  stopSyncMonitoring() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  startDrag(event: PointerEvent, wrapper: VideoWrapper) {
    if (!this.editMode) return;
    if (!wrapper.isVideo) return;
    if ((event.target as HTMLElement).classList.contains('resize-handle'))
      return;

    this.activeDragWrapper = wrapper;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.initialX = wrapper.x;
    this.initialY = wrapper.y;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  startResize(event: PointerEvent, wrapper: VideoWrapper) {
    if (!this.editMode) return;
    if (!wrapper.isVideo) return;

    this.activeResizeWrapper = wrapper;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.initialW = wrapper.width;
    this.initialH = wrapper.height;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    event.stopPropagation();
    event.preventDefault();
  }

  @HostListener('window:pointermove', ['$event'])
  onPointerMove(event: PointerEvent) {
    const stage = this.getStageElement();
    if (!stage) return;
    const stageRect = stage.getBoundingClientRect();

    if (this.activeDragWrapper) {
      const dx = event.clientX - this.dragStartX;
      const dy = event.clientY - this.dragStartY;
      let newX = this.initialX + dx;
      let newY = this.initialY + dy;

      const maxX = stageRect.width - this.activeDragWrapper.width;
      const maxY = stageRect.height - this.activeDragWrapper.height;
      newX = Math.max(0, Math.min(newX, maxX));
      newY = Math.max(0, Math.min(newY, maxY));

      this.activeDragWrapper.x = newX;
      this.activeDragWrapper.y = newY;
    } else if (this.activeResizeWrapper) {
      const dx = event.clientX - this.dragStartX;
      const ratio = this.activeResizeWrapper.aspectRatio;

      let newW = Math.max(150, this.initialW + dx);
      const maxW = stageRect.width - this.activeResizeWrapper.x;
      newW = Math.min(newW, maxW);
      let newH = newW / ratio;

      const maxH = stageRect.height - this.activeResizeWrapper.y;
      if (newH > maxH) {
        newH = maxH;
        newW = newH * ratio;
      }

      this.activeResizeWrapper.width = newW;
      this.activeResizeWrapper.height = newH;
    }
  }

  @HostListener('window:pointerup', ['$event'])
  onPointerUp(event: PointerEvent) {
    this.activeDragWrapper = null;
    this.activeResizeWrapper = null;
  }

  private refreshLayoutState() {
    this.videoWrappers.forEach((w, i) => {
      w.zIndex = 100 + (this.videoWrappers.length - i);
    });
  }

  resetLayout() {
    if (this.isMobileLayout()) {
      this.adaptWrappersToViewport();
      this.refreshLayoutState();
      this.updateMasterReference();
      return;
    }

    const stage = this.getStageElement();
    const stageW = stage ? stage.offsetWidth : 800;
    const stageH = stage ? stage.offsetHeight : 450;

    const videoWrappers = this.videoWrappers.filter(w => w.isVideo);
    videoWrappers.sort((a, b) => {
      const indexA = this.originalTrackOrder.indexOf(a.track.name.split('_')[0]);
      const indexB = this.originalTrackOrder.indexOf(b.track.name.split('_')[0]);
      return indexA - indexB;
    });

    let videoIndex = 0;
    this.videoWrappers.forEach(w => {
      if (!w.isVideo) {
        w.visible = true;
        return;
      }
      const i = videoIndex++;
      if (i === 0) {
        w.x = 0;
        w.y = 0;
        w.width = stageW;
        w.height = w.width / w.aspectRatio;
        if (w.height > stageH) {
          w.height = stageH;
          w.width = w.height * w.aspectRatio;
        }
      } else {
        w.x = 20;
        w.width = 300;
        w.height = w.width / w.aspectRatio;
        let yOffset = 20;
        for (let j = 1; j < i; j++) {
          yOffset += this.videoWrappers[j].height + 10;
        }
        w.y = yOffset;
      }
      w.visible = true;
    });

    this.refreshLayoutState();
    this.updateMasterReference();
  }

  moveUp(index: number) {
    if (!this.editMode || index <= 0) return;
    [this.videoWrappers[index], this.videoWrappers[index - 1]] = [
      this.videoWrappers[index - 1],
      this.videoWrappers[index],
    ];
    this.refreshLayoutState();
    this.updateMasterReference();
  }

  moveDown(index: number) {
    if (!this.editMode || index >= this.videoWrappers.length - 1) return;
    [this.videoWrappers[index], this.videoWrappers[index + 1]] = [
      this.videoWrappers[index + 1],
      this.videoWrappers[index],
    ];
    this.refreshLayoutState();
    this.updateMasterReference();
  }

  private updateMasterReference() {
    const masterWrapper = this.videoWrappers.find(w => w.isVideo);
    if (masterWrapper) {
      const wasDifferentMaster = this.masterPlayerId !== masterWrapper.playerId;
      this.masterPlayerId = masterWrapper.playerId;
      this.setupMasterListeners();

      if (wasDifferentMaster) {
        this.syncStats.clear();
        this.maxDrift = 0;
      }
    }
  }

  private setupMasterListeners() {
    if (this.videoWrappers.length === 0) return;

    const masterWrapper = this.videoWrappers[0];
    const videoEl = masterWrapper.videoElement;
    if (!videoEl) return;

    videoEl.onloadedmetadata = () => {
      if (videoEl.videoWidth && videoEl.videoHeight) {
        masterWrapper.aspectRatio = videoEl.videoWidth / videoEl.videoHeight;
        masterWrapper.height = masterWrapper.width / masterWrapper.aspectRatio;
        const stage = this.getStageElement();
        if (stage) {
          const maxHeight = stage.offsetHeight;
          if (masterWrapper.height > maxHeight) {
            masterWrapper.height = maxHeight;
            masterWrapper.width =
              masterWrapper.height * masterWrapper.aspectRatio;
          }
        }
      }
    };
  }

  toggleVisibility(wrapper: VideoWrapper) {
    if (this.editMode) wrapper.visible = !wrapper.visible;
  }

  toggleEditMode() {
    this.editMode = !this.editMode;
  }

  private applyWrapperAudio(wrapper: VideoWrapper) {
    if (!wrapper.videoElement) return;
    wrapper.videoElement.volume = wrapper.volume;
    wrapper.videoElement.muted = wrapper.volume === 0;
  }

  unlockAudio() {
    this.audioUnlocked = true;
    for (const w of this.videoWrappers) {
      this.applyWrapperAudio(w);
    }
  }

  private async playAllWrappers() {
    for (const w of this.videoWrappers) {
      if (w.videoElement) {
        w.videoElement.playbackRate = 1;
        w.videoElement.muted = true;
        w.videoElement.volume = w.volume;
      }
    }

    await Promise.all(
      this.videoWrappers.map(async (w) => {
        if (!w.videoElement) return;
        try {
          await w.videoElement.play();
        } catch (err) {
          console.warn(`[${w.track.name}] Play failed, retrying muted:`, err);
          w.videoElement.muted = true;
          await w.videoElement.play().catch(() => {});
        }
      }),
    );

    for (const w of this.videoWrappers) {
      this.applyWrapperAudio(w);
    }
  }

  setVolume(wrapper: VideoWrapper, event: Event) {
    this.audioUnlocked = true;
    const val = parseFloat((event.target as HTMLInputElement).value);
    wrapper.volume = val;
    this.applyWrapperAudio(wrapper);
  }

  refreshStream() {
    this.stopSyncMonitoring();
    this.stopPolling();
    this.stopBufferCheck();
    this.videoWrappers.forEach((w) => {
      if (w.hls) {
        w.hls.destroy();
        w.hls = null;
      }
    });
    this.videoWrappers = [];
    this.syncStats.clear();
    this.maxDrift = 0;
    this.playbackStarted = false;
    this.isBufferingPhase = true;
    this.audioUnlocked = false;
    this.pollAttempts = 0;
    this.isInitialized = false;
    this.loadTracks();
  }
}
