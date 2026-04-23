export interface User {
  id: number;
  username: string;
  display_name: string;
  role: "master" | "manager" | "worker";
  is_active: boolean;
  created_at: string | null;
}

export interface Project {
  id: number;
  name: string;
  broadcaster: string;
  description: string | null;
  max_lines: number;
  max_chars_per_line: number;
  bracket_chars: number;
  subtitle_file: string | null;
  video_file: string | null;
  total_duration_ms: number;
  video_duration_ms: number | null;
  file_size_mb: number | null;
  status: "draft" | "submitted" | "approved" | "rejected";
  elapsed_seconds: number;
  last_saved_at: string | null;
  submitted_at: string | null;
  deadline: string | null;
  assigned_to: number | null;
  assigned_to_name: string | null;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string | null;
  subtitle_count: number;
  error_count: number;
  reject_count: number;
  first_submitted_at: string | null;
  fps: number | null;
  import_type: "srt" | "json";
  last_position_ms?: number;
  last_selected_id?: number | null;
  speaker_mode?: string;
}

export type TrackType = "dialogue" | "sfx" | "bgm" | "ambience";
export type Position = "default" | "top" | "deleted";

export interface Subtitle {
  id: number;
  seq: number;
  start_ms: number;
  end_ms: number;
  type: "dialogue" | "effect";
  track_type: TrackType;
  speaker: string;
  // speaker_pos: "default" | "top" | "deleted";
  // text_pos: "default" | "top" | "deleted";
  // position: Position;
  speaker_pos: "default" | "top";       // 위치만 (삭제값 제거)
  text_pos: "default" | "top";          // 위치만
  speaker_deleted: boolean;              // 화자 삭제 표시
  text_deleted: boolean;                 // 대사 삭제 표시
  text: string;
  error: string;
  source_id: string | null;
}

export interface SubtitleCreate {
  after_seq?: number;
  start_ms: number;
  end_ms: number;
  type?: "dialogue" | "effect";
  track_type?: TrackType;
  speaker?: string;
  speaker_pos?: "default" | "top" | "deleted";
  text_pos?: "default" | "top" | "deleted";
  position?: Position;
  text?: string;
  source_id?: string;
}

export interface SubtitleUpdate {
  start_ms?: number;
  end_ms?: number;
  type?: "dialogue" | "effect";
  track_type?: TrackType;
  speaker?: string;
  speaker_pos?: "default" | "top" | "deleted";
  text_pos?: "default" | "top" | "deleted";
  position?: Position;
  text?: string;
  source_id?: string;
}

/** 트랙 타입별 표시 라벨 */
export const TRACK_LABELS: Record<TrackType, string> = {
  dialogue: "대사",
  sfx: "효과음",
  bgm: "배경음악",
  ambience: "환경음",
};

/** 트랙 타입별 색상 (테일윈드 클래스용) */
export const TRACK_COLORS: Record<TrackType, { bg: string; text: string; border: string }> = {
  dialogue: { bg: "bg-blue-500/20", text: "text-blue-400", border: "border-blue-500/30" },
  sfx:      { bg: "bg-yellow-500/20", text: "text-yellow-400", border: "border-yellow-500/30" },
  bgm:      { bg: "bg-purple-500/20", text: "text-purple-400", border: "border-purple-500/30" },
  ambience: { bg: "bg-green-500/20", text: "text-green-400", border: "border-green-500/30" },
};

export const ZOOM_LEVELS = [8889, 10667, 13333, 17778, 26667, 53334] as const;
export const DEFAULT_ZOOM_IDX = 4;