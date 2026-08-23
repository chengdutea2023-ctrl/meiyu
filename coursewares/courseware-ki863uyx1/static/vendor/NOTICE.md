# Vendor Notice

This courseware uses local copies of browser libraries for offline ZIP delivery.

- MediaPipe Tasks Vision Web: `mediapipe/vision_bundle.mjs` and `mediapipe/wasm/*`, package `@mediapipe/tasks-vision@0.10.35`, Apache-2.0.
- MediaPipe Hand Landmarker model: `../models/hand-landmarker/hand_landmarker.task`, stored locally for browser inference.
- RPS keypoint classifier: `../models/rps-keypoint-classifier/rps-classifier.json`, local bootstrap rule classifier.

Keep these files local in the ZIP package. Do not load runtime libraries, WASM files, or model assets from CDN in the final courseware.
