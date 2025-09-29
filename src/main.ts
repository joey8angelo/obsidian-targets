import { Plugin, WorkspaceLeaf } from "obsidian";
import { TargetView, VIEW_TYPE_TARGET } from "./targetView";
import TargetManager from "./targetManager";
import { SettingsTab } from "./settings/settingsTab";
import { Settings, DEFAULT_SETTINGS } from "./settings/settings";

const SAVE_DEBOUNCE = 5000;

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
    if (this.saveTimeout !== null) window.clearTimeout(this.saveTimeout);
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
      window.clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    this.saveSettings();
    this.settingsDirty = false;
  }

  private async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  private async saveSettings() {
    this.settings.targetsData = this.targetManager.getTargetsData();
    await this.saveData(this.settings);
  }

  async onload() {
    await this.loadSettings();

    this.targetManager = new TargetManager(this, this.settings.targetsData);

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
}
