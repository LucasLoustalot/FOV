function initializePlayer(videoElementId, streamUrl) {
    const videoElement = document.getElementById(videoElementId);

    // Check if the browser supports native HLS playback
    if (videoElement.canPlayType("application/vnd.apple.mpegurl")) {
        videoElement.src = streamUrl;
        videoElement.play();
    } else if (Hls.isSupported()) {
        // Use hls.js for HLS playback
        const hls = new Hls();
        hls.loadSource(streamUrl);
        hls.attachMedia(videoElement);
        hls.on(Hls.Events.MANIFEST_PARSED, function () {
            videoElement.play();
        });
    } else {
        alert("HLS playback is not supported in your browser.");
    }

    // Initialize Video.js player
    const player = videojs(videoElementId, {
        controls: true,
        autoplay: true,
        preload: "auto",
    });
}

// Initialize the first player
initializePlayer("videoElement1", "http://localhost:8080/hls/stream1.m3u8");

// Initialize the second player
initializePlayer("videoElement2", "http://localhost:8080/hls/stream2.m3u8");
