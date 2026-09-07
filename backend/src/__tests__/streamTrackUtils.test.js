import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { jest } from '@jest/globals';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testHlsDir = path.join(__dirname, 'test-hls');

describe('streamTrackUtils', () => {
    let isVideoVariant;
    let readStreamMeta;
    let writeStreamMeta;
    let sortTrackIds;
    let findFirstSegment;
    let resolveTrackIsVideo;
    let probeTrackHasVideo;

    beforeEach(async () => {
        jest.resetModules();
        if (!fs.existsSync(testHlsDir)) {
            fs.mkdirSync(testHlsDir, { recursive: true });
        }

        ({
            isVideoVariant,
            readStreamMeta,
            writeStreamMeta,
            sortTrackIds,
            findFirstSegment,
            resolveTrackIsVideo,
            probeTrackHasVideo
        } = await import('../streamTrackUtils.js'));
    });

    afterEach(() => {
        if (fs.existsSync(testHlsDir)) {
            fs.rmSync(testHlsDir, { recursive: true, force: true });
        }
    });

    describe('isVideoVariant', () => {
        test('returns true for indices below tracksV', () => {
            expect(isVideoVariant(0, 2)).toBe(true);
            expect(isVideoVariant(1, 2)).toBe(true);
        });

        test('returns false for audio-only indices when tracksA exceeds tracksV', () => {
            expect(isVideoVariant(2, 2)).toBe(false);
            expect(isVideoVariant(1, 1)).toBe(false);
            expect(isVideoVariant(2, 1)).toBe(false);
        });
    });

    describe('readStreamMeta / writeStreamMeta', () => {
        test('writes and reads stream metadata', () => {
            writeStreamMeta('stream-1', 2, 3, testHlsDir);
            expect(readStreamMeta('stream-1', testHlsDir)).toEqual({
                tracksV: 2,
                tracksA: 3
            });
        });

        test('returns null when metadata is missing', () => {
            expect(readStreamMeta('missing-stream', testHlsDir)).toBeNull();
        });
    });

    describe('sortTrackIds', () => {
        test('sorts track ids numerically', () => {
            expect(sortTrackIds(['2', '10', '1'])).toEqual(['1', '2', '10']);
        });
    });

    describe('findFirstSegment', () => {
        test('returns first segment from playlist', () => {
            const trackDir = path.join(testHlsDir, 'stream-1', '0');
            fs.mkdirSync(trackDir, { recursive: true });
            fs.writeFileSync(path.join(trackDir, 'playlist.m3u8'), '#EXTM3U\nseg00001.ts\n');
            fs.writeFileSync(path.join(trackDir, 'seg00001.ts'), '');

            expect(findFirstSegment(trackDir)).toBe(path.join(trackDir, 'seg00001.ts'));
        });

        test('returns null when no segments exist', () => {
            const trackDir = path.join(testHlsDir, 'stream-1', '1');
            fs.mkdirSync(trackDir, { recursive: true });

            expect(findFirstSegment(trackDir)).toBeNull();
        });
    });

    describe('resolveTrackIsVideo', () => {
        test('uses metadata when available', async () => {
            writeStreamMeta('stream-2', 2, 3, testHlsDir);
            const trackPath = path.join(testHlsDir, 'stream-2', '2');

            await expect(resolveTrackIsVideo('stream-2', '2', trackPath, {
                hlsDir: testHlsDir
            })).resolves.toBe(false);

            await expect(resolveTrackIsVideo('stream-2', '1', trackPath, {
                hlsDir: testHlsDir
            })).resolves.toBe(true);
        });

        test('uses live ffmpeg process data when metadata is missing', async () => {
            const ffmpegProcesses = new Map([
                ['stream-3', { tracksV: 1, tracksA: 2 }]
            ]);
            const trackPath = path.join(testHlsDir, 'stream-3', '1');

            await expect(resolveTrackIsVideo('stream-3', '1', trackPath, {
                hlsDir: testHlsDir,
                ffmpegProcesses
            })).resolves.toBe(false);
        });
    });

    describe('probeTrackHasVideo', () => {
        test('returns false when track has no segments', async () => {
            const trackDir = path.join(testHlsDir, 'stream-4', '0');
            fs.mkdirSync(trackDir, { recursive: true });

            await expect(probeTrackHasVideo(trackDir)).resolves.toBe(false);
        });

        test('returns true when ffprobe reports a video stream', async () => {
            jest.resetModules();
            const promisifyCustom = Symbol.for('nodejs.util.promisify.custom');
            const mockExecFile = jest.fn();
            mockExecFile[promisifyCustom] = () => Promise.resolve({ stdout: 'video\n', stderr: '' });

            jest.unstable_mockModule('child_process', () => ({
                execFile: mockExecFile
            }));

            ({ probeTrackHasVideo } = await import('../streamTrackUtils.js'));

            const trackDir = path.join(testHlsDir, 'stream-5', '0');
            fs.mkdirSync(trackDir, { recursive: true });
            fs.writeFileSync(path.join(trackDir, 'seg00001.ts'), '');

            await expect(probeTrackHasVideo(trackDir)).resolves.toBe(true);
        });
    });
});
