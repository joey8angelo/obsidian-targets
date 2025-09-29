import { TargetData } from "src/target";

export interface ProgressEntry {
  target: number;
  progress: number;
}

interface HistoryEntry {
  [date: string]: {
    [type: string]: ProgressEntry;
  };
}

export interface Settings {
  dailyResetHour: number; // Hour of the day when daily targets reset (0-23)
  weeklyResetDay: number; // Day of the week when weekly targets reset (0-6, where 0 is Sunday)
  useCommentsInWordCount: boolean; // Whether to include comments in word count
  targetsData: TargetData[];
  maxIdleTime: number;
  lastReset: Date;
  progressHistory: Record<string, HistoryEntry>;
  showNegativeProgress: boolean;
  showProgressHistory: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  dailyResetHour: 0,
  weeklyResetDay: 0,
  useCommentsInWordCount: false,
  targetsData: [],
  maxIdleTime: 30000,
  lastReset: new Date(),
  progressHistory: {
    daily: {},
    weekly: {},
  },
  showNegativeProgress: false,
  showProgressHistory: true,
};
