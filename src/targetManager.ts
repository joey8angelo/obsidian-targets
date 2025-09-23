import {
  TAbstractFile,
  TFile,
  Vault,
  Workspace,
  WorkspaceLeaf,
  MarkdownView,
} from "obsidian";
import { getWordCount, getFilesFromFolderPath, generateID } from "./utils";
import TargetTracker from "./main";
import ScheduleManager from "./scheduleManager";
import { Target, WordCountTarget, TimeTarget } from "./target";

export default class TargetManager {
  plugin: TargetTracker;
  vault: Vault;
  workspace: Workspace;

  activeFile: TFile | null = null;
  activeFileTimestamp: number;
  scheduleManager: ScheduleManager;

  constructor(plugin: TargetTracker, vault: Vault, workspace: Workspace) {
    this.plugin = plugin;
    this.vault = vault;
    this.workspace = workspace;
    this.scheduleManager = new ScheduleManager(this.plugin, this);

    this.plugin.registerEvent(
      this.vault.on("modify", (file) => this.handleModify(file)),
    );
    this.workspace.onLayoutReady(() => {
      this.plugin.registerEvent(
        this.vault.on("create", (file) => this.handleCreate(file)),
      );
      this.scheduleManager.checkMissedResets();
      this.scheduleManager.scheduleReset();
    });
    this.plugin.registerEvent(
      this.vault.on("delete", (file) => this.handleDelete(file)),
    );
    this.plugin.registerEvent(
      this.vault.on("rename", (file, oldPath) =>
        this.handleRename(file, oldPath),
      ),
    );
    this.plugin.registerEvent(
      this.workspace.on("active-leaf-change", (leaf) =>
        this.handleActiveLeafChange(leaf),
      ),
    );
  }

  resetTargets(date: Date) {
    const weekday = date.getDay();
    for (const [i, target] of this.plugin.settings.targets.entries()) {
      if (
        target.period === "daily" ||
        (target.period === "weekly" &&
          weekday === this.plugin.settings.weeklyResetDay)
      ) {
        this.plugin.settings.targets[i] = target.getNextTarget();
        this.deleteTarget(target);
        this.archiveTarget(target, date);
      }
    }
  }

  deleteTarget(target: Target) {
    for (let i = 0; i < this.plugin.settings.targets.length; i++) {
      if (target.id === this.plugin.settings.targets[i].id) {
        this.plugin.settings.targets.splice(i, 1);
      }
    }
  }

  archiveTarget(target: Target, date: Date) {
    if (target.period === "none") return;
    const totalProgress = target.getTotalProgress();
    if (totalProgress === 0) return;

    const newDate = new Date(date);
    newDate.setHours(0, 0, 0, 0);
    const datestr = newDate.toISOString().split("T")[0];
    if (!(datestr in this.plugin.settings.progressHistory[target.period])) {
      this.plugin.settings.progressHistory[target.period][datestr] = {
        wordCount: { target: 0, progress: 0 },
        time: { target: 0, progress: 0 },
      };
    }
    this.plugin.settings.progressHistory[target.period][datestr][
      target.type
    ].target += target.target;
    this.plugin.settings.progressHistory[target.period][datestr][
      target.type
    ].progress += totalProgress;

    this.plugin.scheduleSave();
  }

  async handleModify(file: TAbstractFile) {
    if (!(file instanceof TFile)) return;
    const textPromise = this.vault.cachedRead(file);
    const now = Date.now();
    const elapsed = Math.min(
      this.plugin.settings.maxIdleTime,
      now - this.activeFileTimestamp,
    );
    this.activeFileTimestamp = now;
    for (const target of this.plugin.settings.targets) {
      if (target instanceof WordCountTarget) {
        target.updateProgress(
          file,
          getWordCount(
            await textPromise,
            this.plugin.settings.useCommentsInWordCount,
          ),
        );
      } else if (target instanceof TimeTarget) {
        target.updateProgress(file, elapsed);
      }
      this.plugin.scheduleSave();
    }
    this.plugin.renderTargetView();
  }

  async handleCreate(file: TAbstractFile) {
    if (!(file instanceof TFile)) return;
    const textPromise = this.vault.cachedRead(file);
    for (const target of this.plugin.settings.targets) {
      if (target instanceof WordCountTarget) {
        target.updateProgress(
          file,
          getWordCount(
            await textPromise,
            this.plugin.settings.useCommentsInWordCount,
          ),
        );
      }
    }
    this.plugin.scheduleSave();
    this.plugin.renderTargetView();
  }
  handleDelete(file: TAbstractFile) {
    if (!(file instanceof TFile)) return;
    for (const target of this.plugin.settings.targets) {
      target.removeFile(file.path);
    }
    this.plugin.scheduleSave();
    this.plugin.renderTargetView();
  }
  handleRename(file: TAbstractFile, oldPath: string) {
    if (!(file instanceof TFile)) return;
    for (const target of this.plugin.settings.targets) {
      target.renameFile(oldPath, file.path);
    }
    this.plugin.scheduleSave();
    this.plugin.renderTargetView();
  }
  handleActiveLeafChange(leaf: WorkspaceLeaf | null) {
    if (this.activeFile) {
      const now = Date.now();
      const elapsed = Math.min(
        this.plugin.settings.maxIdleTime,
        now - this.activeFileTimestamp,
      );
      for (const target of this.plugin.settings.targets) {
        if (target instanceof TimeTarget) {
          target.updateProgress(this.activeFile, elapsed);
        }
      }
    }
    if (!leaf || !(leaf.view instanceof MarkdownView)) {
      this.activeFile = null;
    } else {
      this.activeFile = leaf.view.file;
      this.activeFileTimestamp = Date.now();
    }
    this.plugin.scheduleSave();
    this.plugin.renderTargetView();
  }

  newTarget(type: "wordCount" | "time") {
    if (type === "wordCount") {
      this.plugin.settings.targets.push(
        new WordCountTarget(
          generateID(),
          "New Target",
          "daily",
          1000,
          {},
          "",
          {},
        ),
      );
      this.plugin.scheduleSave();
      return this.plugin.settings.targets[
        this.plugin.settings.targets.length - 1
      ] as WordCountTarget;
    } else {
      this.plugin.settings.targets.push(
        new TimeTarget(generateID(), "New Target", "daily", 1000, {}, ""),
      );
      this.plugin.scheduleSave();
      return this.plugin.settings.targets[
        this.plugin.settings.targets.length - 1
      ] as TimeTarget;
    }
  }

  async setupProgressForTarget(target: Target) {
    const files = getFilesFromFolderPath(this.vault, target.path);
    target.resetProgress(files);
    // setup the previous progress for word count targets
    if (target instanceof WordCountTarget) {
      for (const file of files) {
        const progress = getWordCount(
          await this.vault.cachedRead(file),
          this.plugin.settings.useCommentsInWordCount,
        );
        target.updateProgress(file, progress);
      }
      // set diff on periodic targets
      if (target.period !== "none") {
        target.previousProgress = { ...target.progress };
      }
    }
    this.plugin.scheduleSave();
    this.plugin.renderTargetView();
  }

  getYearProgress(
    year: number,
    period: "daily" | "weekly",
    type: "wordCount" | "time",
  ) {
    let date = new Date(year, 11, 31);
    let results = [];
    let prevProgress = 0;
    let prevDate = new Date(date);
    while (date.getFullYear() === year) {
      const datestr = date.toISOString().split("T")[0];
      const res = this.plugin.settings.progressHistory[period][datestr];
      // fill in gaps between week progress entries
      if (!res && period === "weekly") {
        results.push({ date: new Date(date), progress: prevProgress });
        date.setDate(date.getDate() - 1);
        if (
          (prevDate.getTime() - date.getTime()) / (1000 * 60 * 60 * 24) >=
          7
        ) {
          prevProgress = 0;
        }
        continue;
      }
      const progress = res
        ? res[type].target !== 0
          ? res[type].progress / res[type].target
          : 0
        : 0;
      results.push({ date: new Date(date), progress: progress });
      prevProgress = progress;
      prevDate = new Date(date);
      date.setDate(date.getDate() - 1);
    }
    results = results.reverse();
    return results;
  }
}
