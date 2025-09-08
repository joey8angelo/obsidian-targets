import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  WorkspaceLeaf,
} from "obsidian";
import { TargetView, VIEW_TYPE_TARGET } from "./targetView";
import { Target, WordCountTarget, TimeTarget } from "./target";
import TargetManager from "./targetManager";

const SAVE_DEBOUNCE = 5000;

export interface Settings {
  dailyResetHour: number; // Hour of the day when daily targets reset (0-23)
  weeklyResetDay: number; // Day of the week when weekly targets reset (0-6, where 0 is Sunday)
  useCommentsInWordCount: boolean; // Whether to include comments in word count
  targets: Target[];
  maxIdleTime: number;
  lastReset: Date;
  progressHistory: {
    daily: {
      [date: string]: {
        wordCount: {
          target: number;
          progress: number;
        };
        time: {
          target: number;
          progress: number;
        };
      };
    };
    weekly: {
      [date: string]: {
        wordCount: {
          target: number;
          progress: number;
        };
        time: {
          target: number;
          progress: number;
        };
      };
    };
  };
  showNegativeProgress: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  dailyResetHour: 0,
  weeklyResetDay: 0,
  useCommentsInWordCount: false,
  targets: [],
  maxIdleTime: 30000,
  lastReset: new Date(),
  progressHistory: {
    daily: {},
    weekly: {},
  },
  showNegativeProgress: false,
};

export default class TargetTracker extends Plugin {
  targetManager: TargetManager;
  settings: Settings;
  private settingsDirty = false;
  private saveTimeout: number | null = null;

  renderTargetView() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TARGET);
    const leaf = leaves.length > 0 ? leaves[0] : null;
    const targetView = leaf?.view instanceof TargetView ? leaf.view : null;
    if (targetView) {
      targetView.renderContent();
    }
  }

  scheduleSave() {
    this.settingsDirty = true;
    if (this.saveTimeout !== null) clearTimeout(this.saveTimeout);
    this.saveTimeout = window.setTimeout(() => {
      if (this.settingsDirty) {
        this.saveSettings();
        this.settingsDirty = false;
      }
      this.saveTimeout = null;
    }, SAVE_DEBOUNCE);
  }

  forceSave() {
    if (this.saveTimeout !== null) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    this.saveSettings();
    this.settingsDirty = false;
  }

  private async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.rehydrateTargets();
  }

  private async saveSettings() {
    await this.saveData(this.settings);
  }

  async onload() {
    await this.loadSettings();

    this.targetManager = new TargetManager(
      this,
      this.app.vault,
      this.app.workspace,
    );

    this.registerView(VIEW_TYPE_TARGET, (leaf) => new TargetView(leaf, this));
    this.addRibbonIcon("turtle", "Open target view", () => {
      this.activateView();
    });

    this.addCommand({
      id: "open-target-view",
      name: "Open Target View",
      callback: () => {
        this.activateView();
      },
    });

    this.addSettingTab(new SettingsTab(this.app, this));
  }

  async onunload() {
    this.forceSave();
  }

  async activateView() {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_TARGET);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      if (!leaf) {
        console.error("obsidian-targets: failed to get or create leaf");
        return;
      }
      await leaf.setViewState({ type: VIEW_TYPE_TARGET, active: true });
    }

    workspace.revealLeaf(leaf);
  }

  private rehydrateTargets() {
    for (let i = 0; i < this.settings.targets.length; i++) {
      const target = this.settings.targets[i];
      if (target.type === "wordCount") {
        this.settings.targets[i] = new WordCountTarget(
          target.id,
          target.name,
          target.period,
          target.scope,
          target.target,
          target.progress,
          target.path,
          (target as WordCountTarget).previousProgress,
        );
      } else if (target.type === "time") {
        this.settings.targets[i] = new TimeTarget(
          target.id,
          target.name,
          target.period,
          target.scope,
          target.target,
          target.progress,
          target.path,
        );
      }
    }
  }
}

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
  }
}
