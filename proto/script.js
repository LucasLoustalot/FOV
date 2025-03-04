const hlsPlayers = {};

function initializePlayer(videoElementId, streamUrl) {
    const videoElement = document.getElementById(videoElementId);
    
    if (Hls.isSupported()) {
        const hls = new Hls({
            liveDurationInfinity: true,
            liveBackBufferLength: 60,
            liveSyncDuration: 10,
            liveMaxLatencyDuration: 15,
            maxBufferLength: 60,
            maxMaxBufferLength: 60,
            highBufferWatchdogPeriod: 5,
            nudgeMaxRetry: 5,
            startLevel: -1,
            startPosition: -1,
            fragLoadingMaxRetry: 8,
            manifestLoadingMaxRetry: 8,
            debug: false
        });
        
        hls.loadSource(streamUrl);
        hls.attachMedia(videoElement);
        
        hls.on(Hls.Events.MANIFEST_PARSED, function() {
            videoElement.play().catch(e => console.error('Play failed:', e));
            console.log(`Playback started for ${videoElementId}`);
            
            console.log(`Stream levels:`, hls.levels);
            if (hls.levels && hls.levels.length > 0) {
                console.log(`Fragment duration:`, hls.levels[0].details?.fragments[0]?.duration || 'unknown');
            }
        });
        
        hls.on(Hls.Events.ERROR, function(event, data) {
            console.log(`HLS error:`, data.type, data.details);
            if (data.fatal) {
                switch(data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        console.log(`Network error, trying to recover for ${videoElementId}`);
                        hls.startLoad();
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        console.log(`Media error, trying to recover for ${videoElementId}`);
                        hls.recoverMediaError();
                        break;
                    default:
                        console.error(`Fatal error, destroying HLS for ${videoElementId}`, data);
                        hls.destroy();
                        break;
                }
            }
        });
        
        hlsPlayers[videoElementId] = hls;
        
        videoElement.addEventListener('pause', function() {
            videoElement.play().catch(e => console.error('Play failed after pause:', e));
        });
        
        return hls;
    } else if (videoElement.canPlayType("application/vnd.apple.mpegurl")) {
        videoElement.src = streamUrl;
        
        videoElement.addEventListener('loadedmetadata', function() {
            videoElement.play().catch(e => console.error('Safari play failed:', e));
        });
        
        videoElement.addEventListener('pause', function() {
            videoElement.play().catch(e => console.error('Safari play failed after pause:', e));
        });
        
        return null;
    } else {
        console.error("HLS playback is not supported in your browser.");
        return null;
    }
}

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
        
        const nameSpan = document.createElement("span");
        nameSpan.textContent = stream.name;
        nameSpan.classList.add("stream-name");
        
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
        
        li.appendChild(nameSpan);
        li.appendChild(arrowsContainer);
        streamList.appendChild(li);
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
            const upArrow = item.querySelector('.up-arrow');
            const downArrow = item.querySelector('.down-arrow');
            
            if (index === 0) {
                upArrow.disabled = true;
                upArrow.classList.add('disabled');
            } else {
                upArrow.disabled = false;
                upArrow.classList.remove('disabled');
            }
            
            if (index === items.length - 1) {
                downArrow.disabled = true;
                downArrow.classList.add('disabled');
            } else {
                downArrow.disabled = false;
                downArrow.classList.remove('disabled');
            }
        });
    }

    streams.forEach(createStreamItem);
    updateArrowVisibility();
    updateZIndexes();

    function toggleEditMode() {
        editMode = !editMode;

        if (editMode) {
            editButton.textContent = "SAVE";
            streamPanel.style.display = "block";

            document.querySelectorAll(".video-container").forEach((el) => {
                const resizeHandle = el.querySelector(".resize-handle");
                el.classList.add("draggable-video");
                el.style.pointerEvents = "auto";
                el.setAttribute("draggable", "true");
                resizeHandle.style.display = "block";
            });
        } else {
            editButton.textContent = "EDIT";
            streamPanel.style.display = "none";

            document.querySelectorAll(".video-container").forEach((el) => {
                const resizeHandle = el.querySelector(".resize-handle");
                el.classList.remove("draggable-video");
                el.style.pointerEvents = "none";
                el.setAttribute("draggable", "false");
                resizeHandle.style.display = "none";
            });
        }
    }

    document.querySelectorAll(".video-container").forEach((el) => {
        el.style.pointerEvents = "none";
        el.setAttribute("draggable", "false");
        const resizeHandle = el.querySelector(".resize-handle");
        resizeHandle.style.display = "none";
    });

    editButton.addEventListener("click", toggleEditMode);
}
