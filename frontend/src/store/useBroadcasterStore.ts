import { create } from "zustand";
import { projectsApi } from "../api/projects";

interface BroadcasterRule {
  max_lines: number;
  max_chars_per_line: number;
  bracket_chars: number;
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
    } catch {
      // 서버 연결 실패 시 폴백
      if (!get().loaded) {
        const fallback: Record<string, BroadcasterRule> = {
          "TVING": { max_lines: 2, max_chars_per_line: 20, bracket_chars: 5 },
          "LGHV": { max_lines: 2, max_chars_per_line: 18, bracket_chars: 5 },
          "SKBB": { max_lines: 1, max_chars_per_line: 20, bracket_chars: 5 },
          "JTBC": { max_lines: 2, max_chars_per_line: 18, bracket_chars: 5 },
          "KBS": { max_lines: 2, max_chars_per_line: 18, bracket_chars: 5 },
          "자유작업": { max_lines: 99, max_chars_per_line: 999, bracket_chars: 0 },
        };
        set({ rules: fallback, names: Object.keys(fallback), loaded: true });
      }
    }
  },
}));