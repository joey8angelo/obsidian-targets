import TargetTracker from "./main";
import { addDays } from "./utils";

export default class ScheduleManager {
  private plugin: TargetTracker;
  private dailyResetTimeout: number | null;

  constructor(plugin: TargetTracker) {
    this.plugin = plugin;
    this.dailyResetTimeout = null;
  }

  checkMissedResets() {
    const lastReset = new Date(this.plugin.settings.lastReset);
    const prevReset = addDays(this.getNextResetDate(), -1);
    if (lastReset < prevReset) {
      this.plugin.targetManager.resetTargets(lastReset);
    }
    this.plugin.settings.lastReset = prevReset;
    this.plugin.scheduleSave();
    this.plugin.renderTargetView();
  }

  scheduleReset() {
    if (this.dailyResetTimeout !== null) {
      window.clearTimeout(this.dailyResetTimeout);
    }
    const nextReset = this.getNextResetDate();
    const msUntilReset = nextReset.getTime() - Date.now();

    this.dailyResetTimeout = window.setTimeout(() => {
      this.plugin.settings.lastReset = nextReset;
      this.plugin.targetManager.resetTargets(addDays(nextReset, -1));
      this.scheduleReset();
      this.plugin.scheduleSave();
      this.plugin.renderTargetView();
    }, msUntilReset);
  }

  private getNextResetDate(startFrom: Date = new Date()) {
    const nextReset = new Date(startFrom);
    nextReset.setHours(this.plugin.settings.dailyResetHour, 0, 0, 0);
    if (nextReset <= startFrom) {
      return addDays(nextReset, 1);
    }
    return nextReset;
  }
}
