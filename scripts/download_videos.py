"""Download the pinned insect playlist and prepare browser-compatible local MP4s.

Requires yt-dlp, ffmpeg, and ffprobe on PATH. Media stays outside Git.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skip-download", action="store_true", help="Use videos already in the download cache")
    args = parser.parse_args()
    for tool in (["ffmpeg", "ffprobe"] if args.skip_download else ["yt-dlp", "ffmpeg", "ffprobe"]):
        if not shutil.which(tool):
            raise SystemExit(f"Missing {tool}. On macOS: brew install yt-dlp ffmpeg")
    cache, output = ROOT / "runs/video-downloads", ROOT / "dist/media"
    cache.mkdir(parents=True, exist_ok=True)
    output.mkdir(parents=True, exist_ok=True)
    ids = json.loads((ROOT / "video-sources.json").read_text())["ids"]
    clips = []
    for video_id in ids:
        if not re.fullmatch(r"[\w-]{11}", video_id):
            raise ValueError("Invalid YouTube video ID")
        source = f"https://www.youtube.com/watch?v={video_id}"
        raw = cache / f"{video_id}.mp4"
        metadata = cache / f"{video_id}.info.json"
        if not args.skip_download and not (raw.exists() and metadata.exists()):
            subprocess.run(["yt-dlp", "--no-playlist", "--no-progress", "--write-info-json", "--merge-output-format", "mp4",
                            "--match-filters", "duration <= 90 & !is_live", "-f",
                            "bv*[height<=720][vcodec^=avc1]+ba[ext=m4a]/b[height<=720][ext=mp4]/bv*[height<=720]+ba/b",
                            "-o", str(cache / "%(id)s.%(ext)s"), source], check=True)
        if not raw.exists() or not metadata.exists():
            raise SystemExit(f"Missing {video_id}; run again without --skip-download")
        data = json.loads(metadata.read_text())
        target = output / f"{video_id}.mp4"
        if not target.exists():
            temporary = output / f"{video_id}.partial.mp4"
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(raw),
                            "-map", "0:v:0", "-map", "0:a?", "-vf", "scale=640:640:force_original_aspect_ratio=decrease:force_divisible_by=2",
                            "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", "-threads", "2",
                            "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(temporary)], check=True)
            temporary.replace(target)
        probe = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(target)]))
        video = next(s for s in probe["streams"] if s["codec_type"] == "video")
        duration = float(probe["format"]["duration"])
        if video["codec_name"] != "h264" or not 0 < duration <= 91:
            raise ValueError(f"Invalid prepared video: {video_id}")
        clips.append({"id": video_id, "file": target.name, "title": data["title"], "channel": data.get("channel") or data.get("uploader", ""),
                      "source": source, "duration": round(duration, 3), "width": video["width"], "height": video["height"],
                      "sha256": hashlib.sha256(target.read_bytes()).hexdigest()})
        print(f'{len(clips):02d} · {duration:.1f}s · {data["title"]}', flush=True)
    temporary = output / "playlist.json.partial"
    temporary.write_text(json.dumps({"version": 1, "clips": clips}, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(output / "playlist.json")
    print(f'{len(clips)} local videos ready, {sum(c["duration"] for c in clips):.0f} seconds per loop.', flush=True)


if __name__ == "__main__":
    main()
