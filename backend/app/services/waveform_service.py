"""
backend/app/services/waveform_service.py
영상에서 오디오 waveform peaks 추출 (ffmpeg 사용)
"""
from __future__ import annotations
import subprocess
import struct
import json
import os
import math


WAVEFORM_DIR = "uploads/waveforms"
os.makedirs(WAVEFORM_DIR, exist_ok=True)

# peaks 해상도: 초당 포인트 수. 높을수록 정밀하지만 데이터 커짐.
# 10 = 100ms당 1포인트. 2시간 영상 = 72000 포인트 (충분히 가벼움)
PEAKS_PER_SECOND = 10


def get_peaks_path(project_id: int) -> str:
    return os.path.join(WAVEFORM_DIR, f"project_{project_id}_peaks.json")


def extract_waveform_peaks(video_path: str, project_id: int, duration_ms: int | None = None) -> str | None:
    """
    영상에서 오디오 peaks 데이터 추출.
    
    1) ffmpeg로 영상 → raw PCM (16bit mono, 8000Hz) 변환
    2) PCM 데이터를 chunk 단위로 나눠서 각 chunk의 max amplitude를 peaks로 추출
    3) JSON으로 저장
    
    Returns: peaks JSON 파일 경로. 실패 시 None.
    """
    peaks_path = get_peaks_path(project_id)
    sample_rate = 8000  # 낮은 샘플레이트로 충분 (파형 시각화용)
    
    try:
        # ffmpeg로 영상 → raw PCM 변환 (16bit signed little-endian, mono, 8kHz)
        result = subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", video_path,
                "-vn",                    # 비디오 스트림 무시
                "-ac", "1",               # 모노
                "-ar", str(sample_rate),   # 8kHz
                "-f", "s16le",            # raw PCM 16bit signed LE
                "-acodec", "pcm_s16le",
                "pipe:1",                 # stdout으로 출력
            ],
            capture_output=True,
            timeout=300,  # 5분 타임아웃
        )
        
        if result.returncode != 0:
            print(f"ffmpeg failed: {result.stderr.decode()[:200]}")
            return None
        
        raw_data = result.stdout
        if not raw_data:
            return None
        
        # PCM 데이터를 16bit signed 배열로 변환
        sample_count = len(raw_data) // 2
        samples = struct.unpack(f"<{sample_count}h", raw_data[:sample_count * 2])
        
        # chunk 크기: 초당 PEAKS_PER_SECOND개의 peaks를 만들기 위한 샘플 수
        chunk_size = sample_rate // PEAKS_PER_SECOND
        if chunk_size < 1:
            chunk_size = 1
        
        # 각 chunk에서 max absolute amplitude 추출 → 0.0~1.0 정규화
        peaks = []
        max_val = 32768.0
        
        for i in range(0, sample_count, chunk_size):
            chunk = samples[i:i + chunk_size]
            if not chunk:
                break
            peak = max(abs(s) for s in chunk) / max_val
            peaks.append(round(min(1.0, peak), 4))
        
        # JSON 저장
        peaks_data = {
            "project_id": project_id,
            "sample_rate": sample_rate,
            "peaks_per_second": PEAKS_PER_SECOND,
            "duration_ms": duration_ms or int(len(samples) / sample_rate * 1000),
            "peaks": peaks,
        }
        
        with open(peaks_path, "w") as f:
            json.dump(peaks_data, f)
        
        return peaks_path
        
    except subprocess.TimeoutExpired:
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