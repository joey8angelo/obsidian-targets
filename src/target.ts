import { TAbstractFile, TFile } from "obsidian";
import { generateID } from "./utils";

interface FilesProgress {
  [path: string]: number;
}

export abstract class Target {
  id: string;
  name: string;
  period: "daily" | "weekly" | "none";
  scope: "file" | "folder" | "vault";
  target: number;
  progress: FilesProgress;
  path: string;
  isEditing: boolean;
  abstract type: "wordCount" | "time";

  constructor(
    id: string,
    name: string,
    period: "daily" | "weekly" | "none",
    scope: "file" | "folder" | "vault",
    target: number,
    progress: FilesProgress,
    path: string,
  ) {
    this.id = id;
    this.name = name;
    this.period = period;
    this.scope = scope;
    this.target = target;
    this.progress = progress;
    this.path = path;
  }

  isTracking(file: TAbstractFile): boolean {
    if (!(file instanceof TFile)) return false;
    return this.isTrackingPath(file.path);
  }

  isTrackingPath(path: string): boolean {
    if (path.startsWith(this.path)) {
      return true;
    }
    return false;
  }

  abstract getNextTarget(): Target;
  abstract getProgress(): FilesProgress;
  abstract getTotalProgress(): number;
  abstract updateProgress(file: TFile, count: number): void;
  abstract resetProgress(files: TFile[]): void;
}

export class WordCountTarget extends Target {
  previousProgress: FilesProgress;
  type: "wordCount" = "wordCount";

  constructor(
    id: string,
    name: string,
    period: "daily" | "weekly" | "none",
    scope: "file" | "folder" | "vault",
    target: number,
    progress: FilesProgress,
    path: string,
    previousProgress: FilesProgress,
  ) {
    super(id, name, period, scope, target, progress, path);
    if (!previousProgress) {
      this.previousProgress = { ...progress };
    } else {
      this.previousProgress = previousProgress;
    }
  }

  getNextTarget() {
    const nextTarget = new WordCountTarget(
      generateID(),
      this.name,
      this.period,
      this.scope,
      this.target,
      { ...this.progress },
      this.path,
      { ...this.progress },
    );
    for (const key in nextTarget.progress) {
      nextTarget.progress[key] = 0;
    }
    return nextTarget;
  }

  getProgress(): FilesProgress {
    const progress = { ...this.progress };
    for (const key in this.progress) {
      if (key in this.previousProgress) {
        progress[key] -= this.previousProgress[key];
      }
    }
    return progress;
  }

  getTotalProgress(): number {
    const progress = this.getProgress();
    let total = 0;
    for (const key in progress) {
      total += progress[key];
    }
    return total;
  }

  updateProgress(file: TFile, count: number) {
    if (this.isTracking(file)) {
      this.progress[file.path] = count;
    }
  }

  resetProgress(files: TFile[]) {
    this.progress = {};
    this.previousProgress = {};
    for (const file of files) {
      if (this.isTracking(file)) {
        this.progress[file.path] = 0;
        this.previousProgress[file.path] = 0;
      }
    }
  }
}

export class TimeTarget extends Target {
  multiplier = 1000;
  type: "time" = "time";
  constructor(
    id: string,
    name: string,
    period: "daily" | "weekly" | "none",
    scope: "file" | "folder" | "vault",
    target: number,
    progress: FilesProgress,
    path: string,
  ) {
    super(id, name, period, scope, target, progress, path);
  }

  getNextTarget() {
    const nextTarget = new TimeTarget(
      generateID(),
      this.name,
      this.period,
      this.scope,
      this.target,
      { ...this.progress },
      this.path,
    );
    for (const key in nextTarget.progress) {
      nextTarget.progress[key] = 0;
    }
    return nextTarget;
  }

  getProgress(): FilesProgress {
    return this.progress;
  }

  getTotalProgress(): number {
    let total = 0;
    for (const key in this.progress) {
      total += this.progress[key];
    }
    return total;
  }

  updateProgress(file: TFile, time: number) {
    if (this.isTracking(file)) {
      if (!this.progress[file.path]) {
        this.progress[file.path] = 0;
      }
      this.progress[file.path] += time;
    }
  }

  resetProgress(files: TFile[]) {
    this.progress = {};
    for (const file of files) {
      if (this.isTracking(file)) {
        this.progress[file.path] = 0;
      }
    }
  }
}
