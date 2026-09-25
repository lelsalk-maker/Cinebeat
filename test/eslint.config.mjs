export default [{
  files: ['**/*.js'],
  languageOptions: {
    ecmaVersion: 2022, sourceType: 'script',
    globals: Object.fromEntries(['window', 'document', 'navigator', 'console', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Image', 'Blob', 'File', 'URL', 'MediaRecorder', 'MediaStream', 'localStorage', 'getComputedStyle', 'location', 'indexedDB', 'createImageBitmap', 'VideoDecoder', 'VideoEncoder', 'VideoFrame', 'EncodedVideoChunk', 'AudioEncoder', 'AudioData', 'OffscreenCanvas', 'OfflineAudioContext', 'AudioContext', 'FaceDetector'].map((g) => [g, 'readonly'])),
  },
  rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { caughtErrors: 'none' }], 'no-dupe-keys': 'error', 'no-unreachable': 'error' },
}];
