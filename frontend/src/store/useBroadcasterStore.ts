import { create } from "zustand";
import { projectsApi } from "../api/projects";

interface BroadcasterRule {
  max_lines: number;
  max_chars_per_line: number;
  bracket_chars: number;
  allow_overlap: boolean;
  min_duration_ms: number;
}

interface BroadcasterState {
  rules: Record<string, BroadcasterRule>;
  names: string[];
  loaded: boolean;
  fetch: () => Promise<void>;
}

export const useBroadcasterStore = create<BroadcasterState>((set, get) => ({
  rules: {},
  names: [],
  loaded: false,

  fetch: async () => {
    try {
      const rules = await projectsApi.getBroadcasterRules();
      const names = Object.keys(rules);
      set({ rules, names, loaded: true });
      return rules;
    } catch {
      if (!get().loaded) {
        const fallback: Record<string, BroadcasterRule> = {
          "TVING": { max_lines: 2, max_chars_per_line: 20, bracket_chars: 5, allow_overlap: false, min_duration_ms: 500 },
          "LGHV": { max_lines: 2, max_chars_per_line: 18, bracket_chars: 5, allow_overlap: false, min_duration_ms: 500 },
          "SKBB": { max_lines: 1, max_chars_per_line: 20, bracket_chars: 5, allow_overlap: false, min_duration_ms: 500 },
          "JTBC": { max_lines: 2, max_chars_per_line: 18, bracket_chars: 5, allow_overlap: false, min_duration_ms: 500 },
          "DLIV": { max_lines: 3, max_chars_per_line: 17, bracket_chars: 5, allow_overlap: false, min_duration_ms: 500 },
          "자유작업": { max_lines: 99, max_chars_per_line: 999, bracket_chars: 0, allow_overlap: true, min_duration_ms: 0 },
        };
        set({ rules: fallback, names: Object.keys(fallback), loaded: true });
      }
      return get().rules;
    }
  },
}));