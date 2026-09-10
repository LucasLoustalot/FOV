import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  Observable,
  BehaviorSubject,
  interval,
  switchMap,
  startWith,
  catchError,
  of,
  map,
} from 'rxjs';
import { environment } from '../../environments/environment';
import {
  AvailableStreamsResponse,
  LiveStreamInfo,
} from '../models/live-stream.model';

@Injectable({
  providedIn: 'root',
})
export class LiveStreamsService {
  private readonly API_URL = environment.apiUrl;
  private readonly POLL_INTERVAL = 5000;

  private liveStreamsSubject = new BehaviorSubject<LiveStreamInfo[]>([]);
  public liveStreams$ = this.liveStreamsSubject.asObservable();

  private isPolling = false;

  constructor(private http: HttpClient) {}

  getAvailableStreams(): Observable<AvailableStreamsResponse> {
    return this.http.get<any>(`${this.API_URL}/streams/available`).pipe(
      map((response) => {
        const streams = Array.isArray(response)
          ? response
          : response?.streams || [];
        return {
          streams: streams,
          streamCount: streams.length,
        };
      }),
      catchError((err) => {
        console.error('Erreur récupération streams:', err);
        return of({ streams: [], streamCount: 0 });
      }),
    );
  }

  getStreamById(streamId: string): Observable<LiveStreamInfo | null> {
    return this.getAvailableStreams().pipe(
      map((response) => {
        const stream = response.streams.find((s) => s.streamId === streamId);
        return stream || null;
      }),
    );
  }

  startPolling(): void {
    if (this.isPolling) return;
    this.isPolling = true;

    interval(this.POLL_INTERVAL)
      .pipe(
        startWith(0),
        switchMap(() => this.getAvailableStreams()),
      )
      .subscribe((response) => {
        this.liveStreamsSubject.next(response.streams);
      });
  }

  stopPolling(): void {
    this.isPolling = false;
  }

  getCurrentStreams(): LiveStreamInfo[] {
    return this.liveStreamsSubject.getValue();
  }
}
