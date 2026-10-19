# ARGON male voice audition V1

This is a fixed 10.205-second Turkish male speech sample, generated once with Supertonic 3, preset M2. It is an original voice audition, not a movie character recording or a dynamic chat voice.

The sample was generated on a cloud CPU runner, with no paid speech API. Phones download only the 900,128-byte WAV, not the approximately 400 MB model. Playback starts only after the user presses Listen in the visible Jarvis tab. The existing voice and recognition are cancelled first; hiding the page stops playback without automatically restarting recognition.

The model provenance and output SHA-256 are in argon-m2-v1.json. Model license: SUPERTONIC-MODEL-LICENSE.txt (OpenRAIL-M). Upstream source: https://github.com/supertone-oss-archive/supertonic at 1e9799e964ea4c0dad7cde993b65c3c813a7b373. The archived runtime is used only for this bounded cloud audition, not deployed as an on-device dependency.

This voice-only web commit does not install the pending CEO backend or native APK candidate. Later deployments must merge this voice audition and its cancellation handshake together, or deliberately remove both. Existing APK native Java and the device TTS engine are unchanged. Actual phone listening acceptance is pending.
