import { App, PluginSettingTab, Setting } from "obsidian";
import TargetTracker from "src/main";

export class SettingsTab extends PluginSettingTab {
  plugin: TargetTracker;

  constructor(app: App, plugin: TargetTracker) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName("Daily Reset Hour")
      .setDesc("Hour of the day when daily targets reset")
      .addDropdown((dropdown) => {
        for (let i = 0; i < 24; i++) {
          const hour = i;
          const amPm = hour >= 12 ? "PM" : "AM";
          const displayHour = hour % 12 === 0 ? 12 : hour % 12;
          dropdown.addOption(hour.toString(), `${displayHour} ${amPm}`);
        }
        dropdown.setValue(this.plugin.settings.dailyResetHour.toString());
        dropdown.onChange(async (value) => {
          this.plugin.settings.dailyResetHour = parseInt(value);
          this.plugin.targetManager.scheduleManager.scheduleReset();
          this.plugin.forceSave();
        });
      });
    new Setting(containerEl)
      .setName("Weekly Reset Day")
      .setDesc("Day of the week when weekly targets reset")
      .addDropdown((dropdown) => {
        const days = [
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ];
        days.forEach((day, index) => {
          dropdown.addOption(index.toString(), day);
        });
        dropdown.setValue(this.plugin.settings.weeklyResetDay.toString());
        dropdown.onChange(async (value) => {
          this.plugin.settings.weeklyResetDay = parseInt(value);
          this.plugin.targetManager.scheduleManager.scheduleReset();
          this.plugin.forceSave();
        });
      });

    new Setting(containerEl)
      .setName("Max Idle Time (seconds)")
      .setDesc(
        "Maximum amount of idle time before pausing time tracking for the current file",
      )
      .addText((text) => {
        text
          .setPlaceholder("Enter max idle time in seconds")
          .setValue((this.plugin.settings.maxIdleTime / 1000).toString());
        text.onChange(async (value) => {
          const parsed = parseInt(value);
          if (!isNaN(parsed) && parsed >= 0) {
            this.plugin.settings.maxIdleTime = parsed * 1000;
            this.plugin.forceSave();
          }
        });
      });

    new Setting(containerEl)
      .setName("Include Comments in Word Count")
      .setDesc("Whether to include markdown comments in the word count")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.useCommentsInWordCount);
        toggle.onChange(async (value) => {
          this.plugin.settings.useCommentsInWordCount = value;
          this.plugin.forceSave();
        });
      });

    new Setting(containerEl)
      .setName("Show Negative Progress")
      .setDesc(
        "When a periodic target resets, and your progress decreases from the previous period, show the negative progress rather than 0 progress. Does not change how progress is calculated, simply how it is displayed.",
      )
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.showNegativeProgress);
        toggle.onChange(async (value) => {
          this.plugin.settings.showNegativeProgress = value;
          this.plugin.forceSave();
        });
      });

    new Setting(containerEl)
      .setName("Show Progress History")
      .setDesc(
        "Show the progress graph in the target view. Shows the periodic targets' progress over the current year.",
      )
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.showProgressHistory);
        toggle.onChange(async (value) => {
          this.plugin.settings.showProgressHistory = value;
          this.plugin.forceSave();
          this.plugin.renderTargetView();
        });
      });
  }
}
