function initializePlayer(videoElementId, streamUrl) {
    const videoElement = document.getElementById(videoElementId);

    if (videoElement.canPlayType("application/vnd.apple.mpegurl")) {
        videoElement.src = streamUrl;
        videoElement.play();
    } else if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(streamUrl);
        hls.attachMedia(videoElement);
        hls.on(Hls.Events.MANIFEST_PARSED, function () {
            videoElement.play();
        });
    } else {
        alert("HLS playback is not supported in your browser.");
    }

    const player = videojs(videoElementId, {
        autoplay: true,
        preload: "auto",
        liveui: true,
    });

    return player;
}

// Initialize players
const player1 = initializePlayer(
    "videoElement1",
    "http://localhost:8080/hls/stream1.m3u8"
);
const player2 = initializePlayer(
    "videoElement2",
    "http://localhost:8080/hls/stream2.m3u8"
);

document.addEventListener("DOMContentLoaded", () => {
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
            const rect = element.getBoundingClientRect();
            aspectRatio = video.videoWidth / video.videoHeight;
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
});

document.addEventListener("DOMContentLoaded", () => {
    let zIndexCounter = 1000;
    const streams = [
        { id: "videoWrapper1", name: "Source 1" },
        { id: "videoWrapper2", name: "Source 2" },
    ];

    const streamList = document.getElementById("streamList");

    function updateZIndexes() {
        // Assign higher z-index to the first item in the list
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

        // Drag handle
        const dragHandle = document.createElement("span");
        dragHandle.classList.add("drag-handle");
        dragHandle.innerHTML = "☰";

        // Stream name
        const nameSpan = document.createElement("span");
        nameSpan.textContent = stream.name;

        li.appendChild(dragHandle);
        li.appendChild(nameSpan);
        streamList.appendChild(li);
    }

    // Initialize draggable list
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

    // Create stream list
    streams.forEach(createStreamItem);
    makeListDraggable();
});
