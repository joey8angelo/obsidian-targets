import { TAbstractFile, TFile } from "obsidian";
import { generateID, getWordCount, getFilesFromFolderPath } from "./utils";
import TargetTracker from "./main";

interface FilesProgress {
  [path: string]: number;
}

interface WordCountTargetData {
  type: "wordCount";
  previousProgress: FilesProgress;
}
interface TimeTargetData {
  type: "time";
  multiplier: number;
}
export interface TargetData {
  id: string;
  name: string;
  period: "daily" | "weekly" | "none";
  target: number;
  progress: FilesProgress;
  path: string;
  concreteData: WordCountTargetData | TimeTargetData;
}

export default abstract class Target {
  id: string;
  name: string;
  period: "daily" | "weekly" | "none";
  target: number;
  progress: FilesProgress;
  path: string;
  isEditing: boolean;
  plugin: TargetTracker;
  abstract type: "wordCount" | "time";

  constructor(
    id: string,
    name: string,
    period: "daily" | "weekly" | "none",
    target: number,
    progress: FilesProgress,
    path: string,
    plugin: TargetTracker,
  ) {
    this.id = id;
    this.name = name;
    this.period = period;
    this.target = target;
    this.progress = progress;
    this.path = path;
    this.isEditing = false;
    this.plugin = plugin;
  }

  isTracking(file: TAbstractFile): boolean {
    if (!(file instanceof TFile)) return false;
    return this.isTrackingPath(file.path);
  }

  isTrackingPath(path: string): boolean {
    if (path.startsWith(this.path) || this.path === "/") {
      return true;
    }
    return false;
  }
  async setupProgress() {
    const files = getFilesFromFolderPath(this.plugin.app.vault, this.path);
    this.progress = {};
    for (const file of files) {
      this.progress[file.path] = 0;
    }
  }
  getProgress(): FilesProgress {
    return this.progress;
  }
  getTotalProgress(): number {
    const progress = this.getProgress();
    let total = 0;
    for (const key in progress) {
      total += progress[key];
    }
    return total;
  }
  fileCreate(file: TFile) {
    if (this.isTracking(file)) {
      this.progress[file.path] = 0;
    }
  }
  fileDelete(file: TFile) {
    delete this.progress[file.path];
  }
  async fileRename(oldPath: string, newFile: TFile) {
    if (this.isTracking(newFile)) {
      this.progress[newFile.path] = this.progress[oldPath] || 0;
    }
    delete this.progress[oldPath];
  }
  fileOpen(_: TFile) {}
  fileModify(_: TFile): Promise<void> | void {}

  abstract getNextTarget(): Target;
  abstract getData(): TargetData;
}

export class WordCountTarget extends Target {
  type: "wordCount" = "wordCount";
  previousProgress: FilesProgress;

  constructor(
    id: string,
    name: string,
    period: "daily" | "weekly" | "none",
    target: number,
    progress: FilesProgress,
    path: string,
    plugin: TargetTracker,
    previousProgress: FilesProgress,
  ) {
    super(id, name, period, target, progress, path, plugin);
    this.previousProgress = previousProgress;
  }

  async setupProgress() {
    const files = getFilesFromFolderPath(this.plugin.app.vault, this.path);
    this.progress = {};
    this.previousProgress = {};
    for (const file of files) {
      this.progress[file.path] = -1;
    }
    // set diff on periodic targets
    if (this.period !== "none") {
      this.previousProgress = { ...this.progress };
    }
  }

  getNextTarget() {
    const nextTarget = new WordCountTarget(
      generateID(),
      this.name,
      this.period,
      this.target,
      { ...this.progress },
      this.path,
      this.plugin,
      { ...this.progress },
    );
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

  async fileModify(file: TFile) {
    await this.updateProgress(file);
  }

  fileCreate(file: TFile) {
    this.updateProgress(file);
  }

  fileDelete(file: TFile) {
    super.fileDelete(file);
    delete this.previousProgress[file.path];
  }

  async fileRename(oldPath: string, newFile: TFile) {
    if (this.isTracking(newFile)) {
      this.progress[newFile.path] =
        this.progress[oldPath] ||
        getWordCount(
          await this.plugin.app.vault.cachedRead(newFile),
          this.plugin.settings.useCommentsInWordCount,
        );
      this.previousProgress[newFile.path] = this.previousProgress[oldPath] || 0;
    }
    delete this.progress[oldPath];
    delete this.previousProgress[oldPath];
  }

  fileOpen(file: TFile) {
    if (this.progress[file.path] === -1) {
      this.updateProgress(file);
    }
  }

  getData() {
    return {
      id: this.id,
      name: this.name,
      period: this.period,
      target: this.target,
      progress: this.progress,
      path: this.path,
      concreteData: {
        type: "wordCount",
        previousProgress: this.previousProgress,
      } as WordCountTargetData,
    };
  }

  private async updateProgress(file: TFile) {
    if (this.isTracking(file)) {
      const count = getWordCount(
        await this.plugin.app.vault.cachedRead(file),
        this.plugin.settings.useCommentsInWordCount,
      );
      if (this.progress[file.path] === -1) {
        this.previousProgress[file.path] = count;
      }
      this.progress[file.path] = count;
    }
  }
}

export class TimeTarget extends Target {
  multiplier: number;

  type: "time" = "time";
  constructor(
    id: string,
    name: string,
    period: "daily" | "weekly" | "none",
    target: number,
    progress: FilesProgress,
    path: string,
    plugin: TargetTracker,
    multiplier = 1000,
  ) {
    super(id, name, period, target, progress, path, plugin);
    this.multiplier = multiplier;
  }

  getNextTarget() {
    const nextTarget = new TimeTarget(
      generateID(),
      this.name,
      this.period,
      this.target,
      { ...this.progress },
      this.path,
      this.plugin,
    );
    for (const key in nextTarget.progress) {
      nextTarget.progress[key] = 0;
    }
    return nextTarget;
  }

  fileModify(file: TFile) {
    if (this.isTracking(file)) {
      this.progress[file.path] =
        (this.progress[file.path] || 0) +
        this.plugin.targetManager.getElapsedTimeOnActiveFile();
    }
  }

  getData() {
    return {
      id: this.id,
      name: this.name,
      period: this.period,
      target: this.target,
      progress: this.progress,
      path: this.path,
      concreteData: {
        type: "time",
        multiplier: this.multiplier,
      } as TimeTargetData,
    };
  }
}
