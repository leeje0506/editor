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
}

export interface Subtitle {
  id: number;
  seq: number;
  start_ms: number;
  end_ms: number;
  type: "dialogue" | "effect";
  speaker: string;
  speaker_pos: "default" | "top";
  text_pos: "default" | "top";
  text: string;
  error: string;
}

export interface SubtitleCreate {
  after_seq?: number;
  start_ms: number;
  end_ms: number;
  type?: "dialogue" | "effect";
  speaker?: string;
  speaker_pos?: "default" | "top";
  text_pos?: "default" | "top";
  text?: string;
}

export interface SubtitleUpdate {
  start_ms?: number;
  end_ms?: number;
  type?: "dialogue" | "effect";
  speaker?: string;
  speaker_pos?: "default" | "top";
  text_pos?: "default" | "top";
  text?: string;
}

export const ZOOM_LEVELS = [5000, 10000, 20000, 40000, 60000, 120000] as const;
export const DEFAULT_ZOOM_IDX = 5;