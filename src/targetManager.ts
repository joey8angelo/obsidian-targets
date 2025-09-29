import { TAbstractFile, TFile, WorkspaceLeaf, MarkdownView } from "obsidian";
import { generateID } from "./utils";
import TargetTracker from "./main";
import ScheduleManager from "./scheduleManager";
import Target, { WordCountTarget, TimeTarget, TargetData } from "./target";

export default class TargetManager {
  plugin: TargetTracker;
  scheduleManager: ScheduleManager;
  targets: Target[] = [];
  private activeFile: TFile | null = null;
  private activeFileTimestamp: number;

  constructor(plugin: TargetTracker, TargetsData: TargetData[]) {
    this.plugin = plugin;

    this.rehydrateTargets(TargetsData);

    this.scheduleManager = new ScheduleManager(this.plugin);

    this.plugin.registerEvent(
      this.plugin.app.vault.on("modify", (file) => this.handleModify(file)),
    );
    this.plugin.app.workspace.onLayoutReady(() => {
      this.plugin.registerEvent(
        this.plugin.app.vault.on("create", (file) => this.handleCreate(file)),
      );
      this.scheduleManager.checkMissedResets();
      this.scheduleManager.scheduleReset();
    });
    this.plugin.registerEvent(
      this.plugin.app.vault.on("delete", (file) => this.handleDelete(file)),
    );
    this.plugin.registerEvent(
      this.plugin.app.vault.on("rename", (file, oldPath) =>
        this.handleRename(file, oldPath),
      ),
    );
    this.plugin.registerEvent(
      this.plugin.app.workspace.on("active-leaf-change", (leaf) =>
        this.handleActiveLeafChange(leaf),
      ),
    );
  }

  private rehydrateTargets(targetsData: TargetData[]) {
    this.targets = [];
    for (const data of targetsData) {
      let target: Target;
      if (data.concreteData.type === "wordCount") {
        target = new WordCountTarget(
          data.id,
          data.name,
          data.period,
          data.target,
          data.progress,
          data.path,
          this.plugin,
          data.concreteData.previousProgress || {},
        );
      } else if (data.concreteData.type === "time") {
        target = new TimeTarget(
          data.id,
          data.name,
          data.period,
          data.target,
          data.progress,
          data.path,
          this.plugin,
          data.concreteData.multiplier || 1000,
        );
      } else {
        continue;
      }
      this.targets.push(target);
    }
  }

  private archiveTarget(target: Target, date: Date) {
    if (target.period === "none") return;
    const totalProgress = target.getTotalProgress();
    if (totalProgress === 0) return;

    const prd = target.period;
    const newDate = new Date(date);
    newDate.setHours(0, 0, 0, 0);
    const dtstr = newDate.toISOString().split("T")[0];
    const typ = target.type;
    if (!(dtstr in this.plugin.settings.progressHistory[prd])) {
      this.plugin.settings.progressHistory[prd][dtstr] = {};
    }
    if (!(typ in this.plugin.settings.progressHistory[prd][dtstr])) {
      this.plugin.settings.progressHistory[prd][dtstr][typ] = {
        target: 0,
        progress: 0,
      };
    }
    this.plugin.settings.progressHistory[prd][dtstr][typ].target +=
      target.target;
    this.plugin.settings.progressHistory[prd][dtstr][typ].progress +=
      totalProgress;

    this.plugin.scheduleSave();
  }

  private async handleModify(file: TAbstractFile) {
    if (!(file instanceof TFile)) return;
    await Promise.all(this.targets.map((t) => t.fileModify(file)));
    this.activeFileTimestamp = Date.now();
    this.plugin.scheduleSave();
    this.plugin.renderTargetView();
  }
  private async handleCreate(file: TAbstractFile) {
    if (!(file instanceof TFile)) return;
    await Promise.all(this.targets.map((t) => t.fileCreate(file)));
    this.plugin.scheduleSave();
    this.plugin.renderTargetView();
  }
  private async handleDelete(file: TAbstractFile) {
    if (!(file instanceof TFile)) return;
    await Promise.all(this.targets.map((t) => t.fileDelete(file)));
    this.plugin.scheduleSave();
    this.plugin.renderTargetView();
  }
  private async handleRename(file: TAbstractFile, oldPath: string) {
    if (!(file instanceof TFile)) return;
    await Promise.all(this.targets.map((t) => t.fileRename(oldPath, file)));
    this.plugin.scheduleSave();
    this.plugin.renderTargetView();
  }
  private handleActiveLeafChange(leaf: WorkspaceLeaf | null) {
    if (
      leaf &&
      leaf.view instanceof MarkdownView &&
      leaf.view.file &&
      leaf.view.file instanceof TFile
    ) {
      const file = leaf.view.file;
      this.activeFile = file;
      this.activeFileTimestamp = Date.now();
      this.targets.forEach((t) => t.fileOpen(file));
    } else {
      this.activeFile = null;
    }
    this.plugin.scheduleSave();
    this.plugin.renderTargetView();
  }

  getTargetsData() {
    return this.targets.map((target) => target.getData());
  }

  resetTargets(date: Date) {
    const weekday = date.getDay();
    for (const [i, target] of this.targets.entries()) {
      if (
        target.period === "daily" ||
        (target.period === "weekly" &&
          weekday === this.plugin.settings.weeklyResetDay)
      ) {
        this.targets[i] = target.getNextTarget();
        this.deleteTarget(target);
        this.archiveTarget(target, date);
      }
    }
  }

  deleteTarget(target: Target) {
    for (let i = 0; i < this.targets.length; i++) {
      if (target.id === this.targets[i].id) {
        this.targets.splice(i, 1);
      }
    }
  }

  newTarget(type: "wordCount" | "time") {
    if (type === "wordCount") {
      this.targets.push(
        new WordCountTarget(
          generateID(),
          "New Target",
          "daily",
          1000,
          {},
          "",
          this.plugin,
          {},
        ),
      );
      this.plugin.scheduleSave();
      return this.targets[this.targets.length - 1] as WordCountTarget;
    } else {
      this.targets.push(
        new TimeTarget(
          generateID(),
          "New Target",
          "daily",
          1000,
          {},
          "",
          this.plugin,
        ),
      );
      this.plugin.scheduleSave();
      return this.targets[this.targets.length - 1] as TimeTarget;
    }
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

  getElapsedTimeOnActiveFile() {
    if (this.activeFile && this.activeFileTimestamp) {
      return Math.min(
        this.plugin.settings.maxIdleTime,
        Date.now() - this.activeFileTimestamp,
      );
    }
    return 0;
  }
}
