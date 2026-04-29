"""
backend/app/services/waveform_service.py
영상에서 오디오 waveform peaks 추출 (ffmpeg 사용)

ffmpeg 바이너리: imageio-ffmpeg 패키지에서 자동 탐색.
시스템에 ffmpeg가 없어도 pip install imageio-ffmpeg 만으로 동작.
"""
from __future__ import annotations
import subprocess
import struct
import json
import os
import re

# imageio-ffmpeg에서 ffmpeg 바이너리 경로 가져오기
try:
    from imageio_ffmpeg import get_ffmpeg_exe
    FFMPEG_BIN = get_ffmpeg_exe()
except ImportError:
    FFMPEG_BIN = "ffmpeg"

WAVEFORM_DIR = "uploads/waveforms"
os.makedirs(WAVEFORM_DIR, exist_ok=True)

# peaks 해상도: 초당 포인트 수. 높을수록 정밀하지만 데이터 커짐.
# 10 = 100ms당 1포인트. 2시간 영상 = 72000 포인트 (충분히 가벼움)
PEAKS_PER_SECOND = 10


def get_peaks_path(project_id: int) -> str:
    return os.path.join(WAVEFORM_DIR, f"project_{project_id}_peaks.json")


def get_video_duration_ms(filepath: str) -> int | None:
    """ffmpeg로 영상 duration 추출 (ffprobe 불필요)"""
    try:
        result = subprocess.run(
            [FFMPEG_BIN, "-i", filepath, "-f", "null", "-"],
            capture_output=True, text=True, timeout=30,
        )
        match = re.search(r"Duration:\s*(\d+):(\d+):(\d+)\.(\d+)", result.stderr)
        if match:
            h, m, s, cs = match.groups()
            return int(h) * 3600000 + int(m) * 60000 + int(s) * 1000 + int(cs) * 10
        return None
    except Exception:
        return None


def extract_waveform_peaks(video_path: str, project_id: int, duration_ms: int | None = None) -> str | None:
    """
    영상에서 오디오 peaks 데이터 추출 (최적화).

    핵심 최적화:
    - ffmpeg 단에서 저샘플레이트로 다운샘플 → 데이터량 줄어듦
    - subprocess 스트리밍으로 메모리 사용 최소화 (전체 로드 X)
    - chunk 단위 스트림 처리로 수 GB 영상도 일정 메모리로 처리

    Returns: peaks JSON 파일 경로. 실패 시 None.
    """
    peaks_path = get_peaks_path(project_id)

    # 낮은 샘플레이트: 초당 PEAKS_PER_SECOND개의 peak를 뽑으려면
    # chunk_size = sample_rate / PEAKS_PER_SECOND 개의 샘플이 필요.
    sample_rate = 4000
    chunk_samples = sample_rate // PEAKS_PER_SECOND  # 400 samples per peak
    chunk_bytes = chunk_samples * 2  # 16bit = 2 bytes per sample

    try:
        proc = subprocess.Popen(
            [
                FFMPEG_BIN, "-y",
                "-i", video_path,
                "-vn",
                "-ac", "1",
                "-ar", str(sample_rate),
                "-f", "s16le",
                "-acodec", "pcm_s16le",
                "pipe:1",
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )

        peaks = []
        max_val = 32768.0
        total_samples = 0

        while True:
            data = proc.stdout.read(chunk_bytes)
            if not data:
                break

            n_samples = len(data) // 2
            if n_samples == 0:
                break

            total_samples += n_samples
            samples = struct.unpack(f"<{n_samples}h", data[:n_samples * 2])
            peak = max(abs(s) for s in samples) / max_val
            peaks.append(round(min(1.0, peak), 4))

        proc.wait(timeout=10)

        if not peaks:
            return None

        computed_duration = int(total_samples / sample_rate * 1000)

        peaks_data = {
            "project_id": project_id,
            "sample_rate": sample_rate,
            "peaks_per_second": PEAKS_PER_SECOND,
            "duration_ms": duration_ms or computed_duration,
            "peaks": peaks,
        }

        with open(peaks_path, "w") as f:
            json.dump(peaks_data, f)

        return peaks_path

    except subprocess.TimeoutExpired:
        if proc:
            proc.kill()
        print(f"ffmpeg timeout for project {project_id}")
        return None
    except Exception as e:
        print(f"waveform extraction failed: {e}")
        return None


def load_peaks(project_id: int) -> dict | None:
    """저장된 peaks 데이터 로드"""
    peaks_path = get_peaks_path(project_id)
    if not os.path.exists(peaks_path):
        return None
    try:
        with open(peaks_path, "r") as f:
            return json.load(f)
    except Exception:
        return None