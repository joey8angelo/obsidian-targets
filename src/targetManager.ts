import { TAbstractFile, TFile, WorkspaceLeaf, MarkdownView } from "obsidian";
import { generateID, addDays } from "./utils";
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
    let currDate = addDays(new Date(year + 1, 0, 1), -1);
    const endDate = new Date(year, 0, 1);
    const result: { date: Date; target: number; progress: number }[] = [];
    let prevWeekResult: {
      date: Date;
      target: number;
      progress: number;
    } | null = null;
    while (currDate >= endDate) {
      const dtstr = currDate.toISOString().split("T")[0];
      if (
        dtstr in this.plugin.settings.progressHistory[period] &&
        type in this.plugin.settings.progressHistory[period][dtstr]
      ) {
        result.push({
          date: new Date(currDate),
          target:
            this.plugin.settings.progressHistory[period][dtstr][type].target,
          progress:
            this.plugin.settings.progressHistory[period][dtstr][type].progress,
        });
        prevWeekResult = result[result.length - 1];
      } else if (period === "weekly" && prevWeekResult) {
        result.push({
          date: new Date(currDate),
          target: prevWeekResult.target,
          progress: prevWeekResult.progress,
        });
      } else {
        result.push({ date: new Date(currDate), target: 0, progress: 0 });
      }
      currDate = addDays(currDate, -1);
      // if prev week exists and is more than 7 days ago, clear it
      if (
        prevWeekResult &&
        (currDate.getTime() - prevWeekResult.date.getTime()) /
          (1000 * 60 * 60 * 24) >=
          7
      ) {
        prevWeekResult = null;
      }
    }
    return result.reverse();
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
