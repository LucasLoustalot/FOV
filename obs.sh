#!/bin/bash

# Stream keys
STREAM_KEY_1="stream1"
STREAM_KEY_2="stream2"

# RTMP server URL
RTMP_SERVER="rtmp://localhost/live"

# OBS profiles and scenes
OBS_PROFILE_1="Stream1"
OBS_PROFILE_2="Stream2"
OBS_SCENE="Scene"

# Function to start OBS without streaming
start_obs() {
    local profile_name=$1
    local instance_name=$2
    local scene_name=$3
    
    echo "Starting OBS instance: $instance_name"
    obs-studio --profile "$profile_name" --scene "$scene_name" &
}

# Start both OBS instances
start_obs "$OBS_PROFILE_1" "OBS Instance 1" "video"
start_obs "$OBS_PROFILE_2" "OBS Instance 2" "camera"

echo "Waiting for OBS instances to fully launch..."

sleep 5

echo "Both OBS instances are running. Starting streams..."

# Start streaming using OBS WebSockets (requires WebSockets plugin enabled in OBS)
obs-cli --password "123456789" --port 4477
obs-cli stream start --port 4477
obs-cli --password "123456789" --port 4466
obs-cli stream start --port 4466

echo "Both OBS instances should now be streaming."
