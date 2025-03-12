const hlsPlayers = {};
var channel;

function initializePlayer(videoElementId, streamUrl) {
    const videoElement = document.getElementById(videoElementId);
    const LIVE_SYNC_DELAY = 10;
    let wasPaused = false;

    if (Hls.isSupported()) {
        const hls = new Hls({
            liveDurationInfinity: true,
            enableWorker: true,
            debug: false,
        });

        hls.loadSource(streamUrl);
        hls.attachMedia(videoElement);

        hls.on(Hls.Events.MANIFEST_PARSED, function () {
            hls.on(Hls.Events.LEVEL_LOADED, function onLevelLoaded() {
                if (hls.liveSyncPosition) {
                    videoElement.currentTime =
                        hls.liveSyncPosition - LIVE_SYNC_DELAY;
                    hls.off(Hls.Events.LEVEL_LOADED, onLevelLoaded);
                    videoElement
                        .play()
                        .catch((e) => console.error("Play failed:", e));
                }
            });
        });

        hls.on(Hls.Events.ERROR, function (event, data) {
            if (data.fatal) {
                switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        hls.startLoad();
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        hls.recoverMediaError();
                        break;
                    default:
                        hls.destroy();
                        break;
                }
            }
        });

        videoElement.addEventListener("pause", function () {
            wasPaused = true;
        });

        videoElement.addEventListener("play", function () {
            if (wasPaused) {
                wasPaused = false;

                setTimeout(() => {
                    if (hls && hls.liveSyncPosition) {
                        const livePos = hls.liveSyncPosition;
                        const targetTime = livePos - LIVE_SYNC_DELAY;
                        videoElement.currentTime = targetTime;
                    } else {
                        console.log(
                            "Cannot seek: liveSyncPosition not available"
                        );
                    }
                }, 50);
            }
        });

        hlsPlayers[videoElementId] = hls;
        return hls;
    } else if (videoElement.canPlayType("application/vnd.apple.mpegurl")) {
        videoElement.src = streamUrl;
        let wasPaused = false;

        videoElement.addEventListener("loadedmetadata", function () {
            videoElement
                .play()
                .catch((e) => console.error("Safari play failed:", e));
        });

        videoElement.addEventListener("pause", function () {
            wasPaused = true;
        });

        videoElement.addEventListener("play", function () {
            if (wasPaused) {
                wasPaused = false;

                setTimeout(() => {
                    if (
                        videoElement.duration &&
                        videoElement.duration !== Infinity
                    ) {
                        const targetTime = Math.max(
                            0,
                            videoElement.duration - LIVE_SYNC_DELAY
                        );
                        videoElement.currentTime = targetTime;
                    } else {
                        console.log(
                            "Safari: duration not available for seeking"
                        );
                    }
                }, 50);
            }
        });

        return null;
    } else {
        console.error("HLS playback is not supported in your browser.");
        return null;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);

    const streamer = urlParams.get("streamer");
    console.log(streamer);

    const parent = "127.0.0.1";
    const height = "100%";
    const width = "100%";
    const iframe = document.createElement("iframe");

    iframe.src = `https://www.twitch.tv/embed/${streamer}/chat?darkpopout&parent=${parent}`;
    iframe.height = height;
    iframe.width = width;
    iframe.setAttribute("frameborder", "0");

    document.getElementById("chat").appendChild(iframe);

    const player1 = initializePlayer(
        "videoElement1",
        "http://localhost:8080/hls/stream1.m3u8"
    );

    const player2 = initializePlayer(
        "videoElement2",
        "http://localhost:8080/hls/stream2.m3u8"
    );

    setupDraggableResizable();
    setupStreamPanel();

    document.querySelectorAll("video").forEach((video) => {
        video.addEventListener("click", function (e) {
            e.stopPropagation();

            if (this.paused) {
                this.play();
            } else {
                this.pause();
            }
        });
    });
});

function setupDraggableResizable() {
    let zIndexCounter = 1000;

    function makeDraggable(element) {
        let offsetX,
            offsetY,
            isDragging = false;

        element.addEventListener("mousedown", (event) => {
            if (
                event.target.classList.contains("resize-handle") ||
                event.button === 2
            )
                return;

            isDragging = true;
            offsetX = event.clientX - element.getBoundingClientRect().left;
            offsetY = event.clientY - element.getBoundingClientRect().top;
            element.style.cursor = "grabbing";
            //element.style.zIndex = ++zIndexCounter;

            event.preventDefault();
        });

        document.addEventListener("mousemove", (event) => {
            if (!isDragging) return;
            let x = event.clientX - offsetX;
            let y = event.clientY - offsetY;
            element.style.left = `${x}px`;
            element.style.top = `${y}px`;
        });

        document.addEventListener("mouseup", () => {
            isDragging = false;
            element.style.cursor = "grab";
        });
    }

    function makeResizable(element) {
        const resizeHandle = element.querySelector(".resize-handle");
        let isResizing = false;
        let aspectRatio = null;

        // For chat, we don't need to maintain aspect ratio
        const isVideo = element.querySelector("video") !== null;
        const targetElement = isVideo
            ? element.querySelector("video")
            : element;

        resizeHandle.addEventListener("mousedown", (event) => {
            isResizing = true;
            event.preventDefault();

            // Only set aspect ratio for videos
            if (isVideo) {
                const video = targetElement;
                aspectRatio = 16 / 9;
                if (video.videoWidth && video.videoHeight) {
                    aspectRatio = video.videoWidth / video.videoHeight;
                }
            }

            //element.style.zIndex = ++zIndexCounter;
        });

        document.addEventListener("mousemove", (event) => {
            if (!isResizing) return;
            const rect = element.getBoundingClientRect();

            let newWidth = event.clientX - rect.left;
            let newHeight;

            // For videos, maintain aspect ratio
            if (isVideo && aspectRatio) {
                newHeight = newWidth / aspectRatio;
            } else {
                // For chat, allow any height
                newHeight = event.clientY - rect.top;
            }

            // Set minimum sizes
            newWidth = Math.max(newWidth, 200);
            newHeight = Math.max(newHeight, isVideo ? 200 / aspectRatio : 200);

            element.style.width = `${newWidth}px`;
            element.style.height = `${newHeight}px`;

            // For videos, also update the video element size
            if (isVideo) {
                targetElement.style.width = `${newWidth}px`;
                targetElement.style.height = `${newHeight}px`;
            }
        });

        document.addEventListener("mouseup", () => {
            isResizing = false;
        });
    }

    const video1 = document.getElementById("videoWrapper1");
    const video2 = document.getElementById("videoWrapper2");
    const chat = document.getElementById("chat");

    // Add resize handle to chat
    if (!chat.querySelector(".resize-handle")) {
        const resizeHandle = document.createElement("div");
        resizeHandle.classList.add("resize-handle");
        chat.appendChild(resizeHandle);
    }

    makeDraggable(video1);
    makeDraggable(video2);
    makeDraggable(chat);
    makeResizable(video1);
    makeResizable(video2);
    makeResizable(chat);
}

function setupStreamPanel() {
    let zIndexCounter = 1000;
    let editMode = false;
    const editButton = document.getElementById("editButton");
    const resetButton = document.getElementById("resetButton");
    const streamPanel = document.getElementById("sourcePanel");
    const streams = [
        { id: "videoWrapper2", name: "Stream 2", visible: true },
        { id: "videoWrapper1", name: "Stream 1", visible: true },
        { id: "chat", name: "Chat", visible: true },
    ];

    const streamList = document.getElementById("sourceList");

    function updateZIndexes() {
        Array.from(streamList.children)
            .reverse()
            .forEach((li, index) => {
                const streamId = li.dataset.streamId;
                const streamElement = document.getElementById(streamId);
                if (streamElement) {
                    streamElement.style.zIndex = zIndexCounter + index;
                }
            });
    }

    function createStreamItem(stream) {
        const li = document.createElement("li");
        li.classList.add("stream-item");
        li.dataset.streamId = stream.id;
        li.dataset.visible = stream.visible.toString();

        const nameSpan = document.createElement("span");
        nameSpan.textContent = stream.name;
        nameSpan.classList.add("stream-name");

        // Create control buttons container
        const controlsContainer = document.createElement("div");
        controlsContainer.classList.add("controls-container");

        // Create visibility toggle button
        const eyeButton = document.createElement("button");
        eyeButton.classList.add("eye-btn");
        eyeButton.title = stream.visible ? "Hide stream" : "Show stream";
        eyeButton.innerHTML = stream.visible
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>'
            : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle><path d="m3 3 18 18"></path></svg>';

        eyeButton.addEventListener("click", () =>
            toggleStreamVisibility(li, stream.id)
        );

        // Add eye button to controls
        controlsContainer.appendChild(eyeButton);

        // Create arrows container
        const arrowsContainer = document.createElement("div");
        arrowsContainer.classList.add("arrows-container");

        const upArrow = document.createElement("button");
        upArrow.innerHTML = "&#9650;";
        upArrow.classList.add("arrow-btn", "up-arrow");
        upArrow.title = "Move up";
        upArrow.addEventListener("click", () => moveStreamUp(li));

        const downArrow = document.createElement("button");
        downArrow.innerHTML = "&#9660;";
        downArrow.classList.add("arrow-btn", "down-arrow");
        downArrow.title = "Move down";
        downArrow.addEventListener("click", () => moveStreamDown(li));

        arrowsContainer.appendChild(upArrow);
        arrowsContainer.appendChild(downArrow);

        // Add all elements to the list item
        li.appendChild(nameSpan);
        li.appendChild(controlsContainer);
        li.appendChild(arrowsContainer);
        streamList.appendChild(li);
    }

    function toggleStreamVisibility(streamItem, streamId) {
        const streamElement = document.getElementById(streamId);
        const eyeButton = streamItem.querySelector(".eye-btn");
        const isVisible = streamItem.dataset.visible === "true";

        // Toggle visibility state
        streamItem.dataset.visible = (!isVisible).toString();

        // Update the eye icon
        if (!isVisible) {
            // Switching to visible
            eyeButton.innerHTML =
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
            eyeButton.title = "Hide stream";
            streamElement.style.display = "block";
        } else {
            // Switching to hidden
            eyeButton.innerHTML =
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle><path d="m3 3 18 18"></path></svg>';
            eyeButton.title = "Show stream";
            streamElement.style.display = "none";
        }
    }

    function moveStreamUp(streamItem) {
        const prevItem = streamItem.previousElementSibling;
        if (prevItem) {
            streamList.insertBefore(streamItem, prevItem);
            updateArrowVisibility();
            updateZIndexes();
        }
    }

    function moveStreamDown(streamItem) {
        const nextItem = streamItem.nextElementSibling;
        if (nextItem) {
            streamList.insertBefore(nextItem, streamItem);
            updateArrowVisibility();
            updateZIndexes();
        }
    }

    function updateArrowVisibility() {
        const items = Array.from(streamList.children);

        items.forEach((item, index) => {
            const upArrow = item.querySelector(".up-arrow");
            const downArrow = item.querySelector(".down-arrow");

            if (index === 0) {
                upArrow.disabled = true;
                upArrow.classList.add("disabled");
            } else {
                upArrow.disabled = false;
                upArrow.classList.remove("disabled");
            }

            if (index === items.length - 1) {
                downArrow.disabled = true;
                downArrow.classList.add("disabled");
            } else {
                downArrow.disabled = false;
                downArrow.classList.remove("disabled");
            }
        });
    }

    // Clear the list first to avoid duplicates
    streamList.innerHTML = "";
    streams.forEach(createStreamItem);
    updateArrowVisibility();
    updateZIndexes();

    function toggleEditMode() {
        editMode = !editMode;

        if (editMode) {
            editButton.textContent = "SAVE";
            streamPanel.style.display = "block";
            resetButton.style.visibility = "visible";

            document
                .querySelectorAll(".video-container, #chat")
                .forEach((el) => {
                    const resizeHandle = el.querySelector(".resize-handle");
                    el.classList.add("draggable-video");
                    el.style.pointerEvents = "auto";
                    el.setAttribute("draggable", "true");
                    if (resizeHandle) {
                        resizeHandle.style.display = "block";
                    }
                });
        } else {
            resetButton.style.visibility = "hidden";
            editButton.textContent = "EDIT";
            streamPanel.style.display = "none";

            document
                .querySelectorAll(".video-container, #chat")
                .forEach((el) => {
                    const resizeHandle = el.querySelector(".resize-handle");
                    const videoEl = el.querySelector("video");

                    el.classList.remove("draggable-video");
                    el.style.pointerEvents = "none";
                    el.setAttribute("draggable", "false");
                    if (resizeHandle) {
                        resizeHandle.style.display = "none";
                    }

                    // For chat, we don't need to change pointer events for video
                    if (videoEl) {
                        //videoEl.style.pointerEvents = "auto";
                    }
                });
        }
    }

    function resetLayout() {
        const video1 = document.getElementById("videoWrapper1");
        const video2 = document.getElementById("videoWrapper2");
        const chat = document.getElementById("chat");

        const videoWrap1 = document.getElementById("videoElement1");
        const videoWrap2 = document.getElementById("videoElement2");

        video1.style.top = "10vh";
        video1.style.left = "23vw";
        video1.style.width = "70vw";
        video1.style.height = "39.375vw";
        videoWrap1.style.width = "70vw";
        videoWrap1.style.height = "39.375vw";

        video2.style.top = "10vh";
        video2.style.left = "68vw";
        video2.style.width = "25vw";
        video2.style.height = "14.0625vw";
        videoWrap2.style.width = "25vw";
        videoWrap2.style.height = "14.0625vw";

        // Reset chat position
        chat.style.top = "10vh";
        chat.style.left = "1.5vw";
        chat.style.width = "20vw";
        chat.style.height = "87vh";
    }

    document.querySelectorAll(".video-container, #chat").forEach((el) => {
        el.style.pointerEvents = "none";
        el.setAttribute("draggable", "false");
        const resizeHandle = el.querySelector(".resize-handle");
        if (resizeHandle) {
            resizeHandle.style.display = "none";
        }
    });

    editButton.addEventListener("click", toggleEditMode);
    resetButton.addEventListener("click", resetLayout);
}
