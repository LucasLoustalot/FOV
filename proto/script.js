// Initialize HLS players and keep references
const hlsPlayers = {};

function initializePlayer(videoElementId, streamUrl) {
    const videoElement = document.getElementById(videoElementId);
    
    if (Hls.isSupported()) {
        const hls = new Hls({
            liveDurationInfinity: true,
            liveBackBufferLength: 0,
            liveSyncDuration: 0.5,
            liveMaxLatencyDuration: 5,
            highBufferWatchdogPeriod: 1,
            nudgeMaxRetry: 10,
            maxBufferLength: 10,
            maxMaxBufferLength: 10,
            maxBufferSize: 20 * 1000 * 1000, // 20MB
            maxBufferHole: 0.1
        });
        
        hls.loadSource(streamUrl);
        hls.attachMedia(videoElement);
        
        hls.on(Hls.Events.MANIFEST_PARSED, function() {
            videoElement.play();
        });
        
        // Force seeking to live edge whenever possible
        hls.on(Hls.Events.LEVEL_LOADED, function() {
            if (hls.liveSyncPosition) {
                videoElement.currentTime = hls.liveSyncPosition;
            }
        });
        
        // Set up periodic live edge sync (every 5 seconds)
        setInterval(() => {
            if (hls.liveSyncPosition) {
                videoElement.currentTime = hls.liveSyncPosition;
            }
        }, 5000);
        
        // Store the HLS instance
        hlsPlayers[videoElementId] = hls;
        
        return hls;
    } else if (videoElement.canPlayType("application/vnd.apple.mpegurl")) {
        // For Safari
        videoElement.src = streamUrl;
        videoElement.addEventListener('loadedmetadata', function() {
            videoElement.play();
        });
        
        // Safari doesn't support HLS.js, so we need a different approach
        // to keep it at the live edge
        videoElement.addEventListener('timeupdate', function() {
            // If we're more than 5 seconds behind live, try to catch up
            if (videoElement.duration - videoElement.currentTime > 5) {
                videoElement.currentTime = videoElement.duration - 1;
            }
        });
        
        return null;
    } else {
        console.error("HLS playback is not supported in your browser.");
        return null;
    }
}

// Initialize players
document.addEventListener("DOMContentLoaded", () => {
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
            element.style.zIndex = ++zIndexCounter;

            // Prevent pausing when dragging
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
        const video = element.querySelector("video");
        let isResizing = false;
        let aspectRatio;

        resizeHandle.addEventListener("mousedown", (event) => {
            isResizing = true;
            event.preventDefault();
            
            // Default to 16:9 if video dimensions aren't available yet
            aspectRatio = 16/9;
            if (video.videoWidth && video.videoHeight) {
                aspectRatio = video.videoWidth / video.videoHeight;
            }
            
            element.style.zIndex = ++zIndexCounter;
        });

        document.addEventListener("mousemove", (event) => {
            if (!isResizing) return;
            const rect = element.getBoundingClientRect();

            let newWidth = event.clientX - rect.left;
            let newHeight = newWidth / aspectRatio;

            newWidth = Math.max(newWidth, 200);
            newHeight = Math.max(newHeight, 200 / aspectRatio);

            element.style.width = `${newWidth}px`;
            element.style.height = `${newHeight}px`;

            video.style.width = `${newWidth}px`;
            video.style.height = `${newHeight}px`;
        });

        document.addEventListener("mouseup", () => {
            isResizing = false;
        });
    }

    const video1 = document.getElementById("videoWrapper1");
    const video2 = document.getElementById("videoWrapper2");

    makeDraggable(video1);
    makeDraggable(video2);
    makeResizable(video1);
    makeResizable(video2);
}

function setupStreamPanel() {
    let zIndexCounter = 1000;
    let editMode = false;
    const editButton = document.getElementById("editButton");
    const streamPanel = document.getElementById("streamPanel");
    const streams = [
        { id: "videoWrapper1", name: "Stream 1" },
        { id: "videoWrapper2", name: "Stream 2" },
    ];

    const streamList = document.getElementById("streamList");

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
        li.draggable = true;

        const dragHandle = document.createElement("span");
        dragHandle.classList.add("drag-handle");
        dragHandle.innerHTML = "☰";

        const nameSpan = document.createElement("span");
        nameSpan.textContent = stream.name;

        li.appendChild(dragHandle);
        li.appendChild(nameSpan);
        streamList.appendChild(li);
    }

    function makeListDraggable() {
        let draggedItem = null;

        streamList.addEventListener("dragstart", (e) => {
            draggedItem = e.target;
            setTimeout(() => (draggedItem.style.opacity = "0.5"), 0);
        });

        streamList.addEventListener("dragend", () => {
            draggedItem.style.opacity = "1";
            updateZIndexes();
        });

        streamList.addEventListener("dragover", (e) => {
            e.preventDefault();
            const afterElement = getDragAfterElement(streamList, e.clientY);
            if (afterElement == null) {
                streamList.appendChild(draggedItem);
            } else {
                streamList.insertBefore(draggedItem, afterElement);
            }
        });

        function getDragAfterElement(container, y) {
            const draggableElements = [
                ...container.querySelectorAll(".stream-item:not(.dragging)"),
            ];

            return draggableElements.reduce(
                (closest, child) => {
                    const box = child.getBoundingClientRect();
                    const offset = y - box.top - box.height / 2;
                    if (offset < 0 && offset > closest.offset) {
                        return { offset, element: child };
                    } else {
                        return closest;
                    }
                },
                { offset: Number.NEGATIVE_INFINITY }
            ).element;
        }
    }

    streams.forEach(createStreamItem);
    makeListDraggable();

    function toggleEditMode() {
        editMode = !editMode;

        if (editMode) {
            editButton.textContent = "SAVE";
            streamPanel.style.display = "block";

            document.querySelectorAll(".video-container").forEach((el) => {
                const resizeHandle = el.querySelector(".resize-handle");
                el.classList.add("draggable-video");
                el.style.pointerEvents = "auto"; // Allow moving/resizing
                el.setAttribute("draggable", "true"); // Enable dragging
                resizeHandle.style.display = "block"; // Show resize handle
            });
        } else {
            editButton.textContent = "EDIT";
            streamPanel.style.display = "none";

            document.querySelectorAll(".video-container").forEach((el) => {
                const resizeHandle = el.querySelector(".resize-handle");
                el.classList.remove("draggable-video");
                el.style.pointerEvents = "none"; // Lock layout
                el.setAttribute("draggable", "false"); // Disable dragging
                resizeHandle.style.display = "none"; // Hide resize handle
            });
        }
    }

    // Ensure that streams are locked by default when loading the page
    document.querySelectorAll(".video-container").forEach((el) => {
        el.style.pointerEvents = "none"; // Disable interactions
        el.setAttribute("draggable", "false"); // Disable dragging
        const resizeHandle = el.querySelector(".resize-handle");
        resizeHandle.style.display = "none"; // Hide resize handle
    });

    editButton.addEventListener("click", toggleEditMode);
}