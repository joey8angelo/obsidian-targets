import TargetTracker from "./main";
import TargetManager from "./targetManager";

export default class ScheduleManager {
  private plugin: TargetTracker;
  private targetManager: TargetManager;
  private dailyResetTimeout: number | null;

  constructor(plugin: TargetTracker, targetManager: TargetManager) {
    this.plugin = plugin;
    this.targetManager = targetManager;
    this.dailyResetTimeout = null;
  }

  checkMissedResets() {
    let currReset = new Date(this.plugin.settings.lastReset);
    currReset.setDate(currReset.getDate() + 1);
    const nextReset = this.getNextResetDate();
    while (currReset.getTime() < nextReset.getTime()) {
      this.plugin.settings.lastReset = new Date(currReset);
      this.targetManager.resetTargets(new Date(currReset.getDate() - 1));
      currReset.setDate(currReset.getDate() + 1);
      this.plugin.scheduleSave();
    }
    this.plugin.renderTargetView();
  }

  scheduleReset() {
    if (this.dailyResetTimeout !== null) {
      window.clearTimeout(this.dailyResetTimeout);
    }
    const nextReset = this.getNextResetDate();
    const msUntilReset = nextReset.getTime() - Date.now();

    this.dailyResetTimeout = window.setTimeout(() => {
      const currReset = new Date(nextReset);
      currReset.setDate(currReset.getDate() - 1);
      this.plugin.settings.lastReset = currReset;
      this.plugin.targetManager.resetTargets(nextReset);
      this.scheduleReset();
      this.plugin.scheduleSave();
      this.plugin.renderTargetView();
    }, msUntilReset);
  }

  private getNextResetDate(startFrom: Date = new Date()) {
    const nextReset = new Date(startFrom);
    nextReset.setHours(this.plugin.settings.dailyResetHour, 0, 0, 0);
    if (nextReset <= startFrom) {
      nextReset.setDate(nextReset.getDate() + 1);
    }

    return nextReset;
  }
}
