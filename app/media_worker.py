"""Fixed deterministic media operations. UTF-8 JSON stdin/stdout, diagnostics on stderr.

No AI, business credentials, HTTP listener or Runtime forwarding enters this worker.
The Host materializes App assets inside its scratch root and adopts outputs afterwards.
"""
import json
import os
import subprocess
import sys
from contextlib import redirect_stdout
from pathlib import Path

ROOT = Path(os.environ["MPT_SCRATCH_ROOT"]).resolve()
FFMPEG = os.environ["IMAGEIO_FFMPEG_EXE"]
FFPROBE = os.environ["MPT_FFPROBE"]


def location(value):
    candidate = (ROOT / value).resolve()
    if not candidate.is_relative_to(ROOT):
        raise ValueError("Media path escapes the Host scratch workspace")
    candidate.parent.mkdir(parents=True, exist_ok=True)
    return str(candidate)


def run(arguments):
    result = subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", *arguments],
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if result.returncode:
        raise RuntimeError(result.stderr.decode("utf-8", errors="replace")[-2500:])


def probe(filename):
    result = subprocess.run([FFPROBE, "-v", "error", "-show_format", "-show_streams", "-of", "json", location(filename)],
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
    data = json.loads(result.stdout.decode("utf-8"))
    video = next((s for s in data["streams"] if s["codec_type"] == "video"), {})
    return {"duration": float(data.get("format", {}).get("duration", 0)),
            "width": video.get("width", 0), "height": video.get("height", 0),
            "audio": any(s["codec_type"] == "audio" for s in data["streams"]), "colorSpace": video.get("color_space", "")}


def handle(operation, data):
    if operation == "probe":
        return probe(data["file"])
    if operation == "silence":
        duration = float(data["duration"])
        if not 0.2 <= duration <= 600:
            raise ValueError("Invalid silent track duration")
        run(["-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", str(duration), location(data["output"])])
        return {"file": data["output"], **probe(data["output"])}
    if operation == "prepare-audio":
        speed = float(data.get("speed", 1))
        if not 0.5 <= speed <= 2:
            raise ValueError("Invalid audio speed")
        run(["-i", location(data["file"]), "-vn", *(["-af", f"atempo={speed}"] if speed != 1 else []), "-ar", "44100", "-ac", "1", location(data["output"])])
        return {"file": data["output"], **probe(data["output"])}
    if operation == "split-audio":
        duration = probe(data["file"])["duration"]
        chunks = []
        offset = 0
        while offset < duration:
            filename = f'{data["prefix"]}/chunk-{len(chunks)}.wav'
            run(["-ss", str(offset), "-i", location(data["file"]), "-t", str(min(45, duration-offset)),
                 "-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", location(filename)])
            chunks.append({"file": filename, "offset": offset})
            offset += 45
        return {"chunks": chunks}
    if operation == "render":
        from app.models.schema import VideoAspect, VideoConcatMode, VideoFitMode, VideoParams, VideoTransitionMode
        from app.services.video import combine_videos, generate_video, preprocess_video
        from app.models.schema import MaterialInfo
        p = data["params"]
        materials = [MaterialInfo(url=location(name)) for name in data["materials"]]
        processed = preprocess_video(materials, clip_duration=p["clipDuration"])
        combined, output = data["combined"], data["output"]
        if not processed:
            raise ValueError("No decodable material passed the size checks")
        combine_videos(location(combined), [m.url for m in processed], location(data["audio"]),
                       video_aspect=VideoAspect(p["aspect"]), video_concat_mode=VideoConcatMode(p["order"]),
                       video_transition_mode=VideoTransitionMode(p["transition"] or None),
                       max_clip_duration=p["clipDuration"], clip_speed=p["clipSpeed"],
                       video_fit_mode=VideoFitMode(p["fit"]), threads=2)
        subtitle_file = data["subtitle"]
        params = VideoParams(video_subject=p["topic"], video_aspect=p["aspect"], voice_volume=p["voiceVolume"],
                             bgm_type="custom" if data.get("music") and p["musicVolume"] > 0 else "",
                             bgm_volume=p["musicVolume"], subtitle_enabled=bool(subtitle_file),
                             subtitle_position=p["subtitlePosition"], custom_position=p["subtitleY"],
                             subtitle_display_mode=p["subtitleMode"], subtitle_animation=p["animation"],
                             font_name="NotoSansCJKsc-Regular.otf", font_size=p["fontSize"], text_fore_color=p["textColor"],
                             text_background_color=p["background"] or False, rounded_subtitle_background=p["roundedBackground"],
                             stroke_color=p["strokeColor"], stroke_width=p["strokeWidth"], n_threads=2)
        # The final SRT already contains real typed word intervals; never divide a sentence here.
        mixed = generate_video(location(combined), location(data["audio"]), location(subtitle_file) if subtitle_file else "",
                               location(output), params, bgm_file_override=location(data["music"]) if data.get("music") else "",
                               loop_bgm=p["music"] in ("upload", "random"))
        return {"combined": combined, "video": output, "probe": probe(output), "musicMixed": mixed}
    raise ValueError("Unknown media operation")


def main():
    try:
        request = json.loads(sys.stdin.buffer.readline(4 * 1024 * 1024).decode("utf-8", errors="strict"))
        with redirect_stdout(sys.stderr):
            result = handle(request["operation"], request["input"])
        response = {"ok": True, "result": result}
    except Exception as error:
        response = {"ok": False, "error": str(error)}
    sys.stdout.buffer.write((json.dumps(response, ensure_ascii=False) + "\n").encode("utf-8", errors="strict"))
    sys.stdout.buffer.flush()
    return 0 if response["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
