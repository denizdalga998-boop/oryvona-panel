"""One public, fixed voice audition. Run on a cloud CI runner, never DJ-KABIN."""
import hashlib
import json
import math
import os
from pathlib import Path
import urllib.request
import wave

REVISION = "aafc6e32416a594460b32413efc49d7fe4ce6d46"
BASE = "https://huggingface.co/supertone-oss-archive/supertonic-3/resolve/" + REVISION + "/"
TEXT = "Merhaba Deniz. Ben Argon. Bu bir erkek ses denemesidir. Bu sesi duyuyorsan uygulamanın web güncellemesi telefonuna ulaşmış demektir."
MODELS = {
    "duration_predictor.onnx": (3700147, "c3eb91414d5ff8a7a239b7fe9e34e7e2bf8a8140d8375ffb14718b1c639325db"),
    "text_encoder.onnx": (36416150, "c7befd5ea8c3119769e8a6c1486c4edc6a3bc8365c67621c881bbb774b9902ff"),
    "vector_estimator.onnx": (256534781, "883ac868ea0275ef0e991524dc64f16b3c0376efd7c320af6b53f5b780d7c61c"),
    "vocoder.onnx": (101424195, "085de76dd8e8d5836d6ca66826601f615939218f90e519f70ee8a36ed2a4c4ba"),
}

def digest(data):
    return hashlib.sha256(data).hexdigest()

def valid_model(name, data):
    size, expected = MODELS[name]
    return len(data) == size and digest(data) == expected

def fetch(relative, dest, size_limit, expected_hash=None):
    request = urllib.request.Request(BASE + relative, headers={"User-Agent": "Oryvona-Voice-Audition/1"})
    dest.parent.mkdir(parents=True, exist_ok=True)
    hasher, size = hashlib.sha256(), 0
    with urllib.request.urlopen(request, timeout=120) as response, dest.open("wb") as out:
        if not response.geturl().startswith("https://"):
            raise RuntimeError("HTTPS required")
        while True:
            block = response.read(1024 * 1024)
            if not block:
                break
            size += len(block)
            if size > size_limit:
                raise RuntimeError("Download exceeded bounded size: " + relative)
            hasher.update(block)
            out.write(block)
    if expected_hash and hasher.hexdigest() != expected_hash:
        raise RuntimeError("Model hash mismatch: " + relative)
    return {"file": relative, "bytes": size, "sha256": hasher.hexdigest()}

def main():
    if os.environ.get("GITHUB_ACTIONS") != "true":
        raise RuntimeError("This audition must run on the cloud CI runner")
    assets, output = Path("voice-assets"), Path("voice-output")
    records = []
    for name, (size, expected) in MODELS.items():
        records.append(fetch("onnx/" + name, assets / "onnx" / name, size, expected))
    for name in ["onnx/tts.json", "onnx/unicode_indexer.json", "voice_styles/M2.json", "LICENSE"]:
        records.append(fetch(name, assets / name, 2_000_000))
    import numpy as np
    import soundfile as sf
    from helper import load_text_to_speech, load_voice_style
    np.random.seed(42)
    tts = load_text_to_speech(str(assets / "onnx"), False)
    style = load_voice_style([str(assets / "voice_styles" / "M2.json")])
    wav, durations = tts(TEXT, "tr", style, 8, 1.0)
    seconds = float(durations[0].item())
    if not math.isfinite(seconds) or not 1 <= seconds <= 30:
        raise RuntimeError("Audition duration outside limit")
    audio = np.asarray(wav[0, :int(tts.sample_rate * seconds)], dtype=np.float32)
    if not np.isfinite(audio).all() or not 0.005 <= float(np.max(np.abs(audio))) <= 10:
        raise RuntimeError("Invalid or silent generated audio")
    output.mkdir(exist_ok=True)
    result = output / "argon-m2-v1.wav"
    sf.write(str(result), np.clip(audio, -1, 1), tts.sample_rate, subtype="PCM_16")
    with wave.open(str(result), "rb") as check:
        if check.getnchannels() != 1 or check.getsampwidth() != 2 or check.getframerate() != tts.sample_rate:
            raise RuntimeError("Unexpected WAV format")
        frames = check.getnframes()
    (output / "MODEL-LICENSE.txt").write_bytes((assets / "LICENSE").read_bytes())
    receipt = {"schemaVersion": 1, "kind": "fixed-public-voice-audition", "voice": "M2", "language": "tr", "text": TEXT,
        "model": "supertone-oss-archive/supertonic-3", "revision": REVISION, "sourceRevision": "1e9799e964ea4c0dad7cde993b65c3c813a7b373",
        "sampleRate": tts.sample_rate, "frames": frames, "seconds": frames / tts.sample_rate,
        "sha256": digest(result.read_bytes()), "bytes": result.stat().st_size, "assets": records,
        "apiSpend": 0, "runtime": "cloud-cpu", "phoneModelDownload": False, "dynamicChatVoice": False,
        "listeningAcceptance": "NOT_RUN"}
    (output / "receipt.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: receipt[k] for k in ["kind", "voice", "seconds", "sha256", "bytes", "apiSpend"]}))

if __name__ == "__main__":
    main()
