import {
  ItemView,
  WorkspaceLeaf,
  ProgressBarComponent,
  setIcon,
} from "obsidian";
import TargetTracker from "./main";
import { msToStr } from "./utils";
import { Target, TimeTarget, WordCountTarget } from "./target";

export const VIEW_TYPE_TARGET = "target-view";

interface EditingState {
  name: string;
  path: string;
  period: "none" | "daily" | "weekly";
  target: number;
  multiplier: number;
}

export class TargetView extends ItemView {
  private plugin: TargetTracker;
  private editingStates: Map<string, EditingState> = new Map();

  constructor(leaf: WorkspaceLeaf, plugin: TargetTracker) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return VIEW_TYPE_TARGET;
  }

  getDisplayText() {
    return "Target View";
  }

  getIcon() {
    return "turtle";
  }

  async onOpen() {
    this.plugin.registerTargetView(this);
    this.renderContent();
  }

  async onClose() {
    this.plugin.unregisterTargetView(this);
  }

  private renderTarget(container: HTMLElement, target: Target) {
    if (this.editingStates.get(target.id)) {
      this.renderEditingTarget(container, target);
    } else {
      this.renderDisplayTarget(container, target);
    }
  }

  private renderDisplayTarget(container: HTMLElement, target: Target) {
    const targetEl = container.createDiv({ cls: "target-item" });

    const headerEl = targetEl.createDiv({ cls: "target-header" });
    headerEl
      .createDiv({ cls: "target-header-title" })
      .createEl("h3", { text: target.name });
    const editButton = headerEl.createEl("button", { cls: "icon-button" });
    setIcon(editButton, "pencil");
    editButton.onclick = () => {
      this.editingStates.set(target.id, {
        name: target.name,
        path: target.path,
        period: target.period,
        target: target.target,
        multiplier: target instanceof TimeTarget ? target.multiplier : 1,
      } as EditingState);
      this.renderContent();
    };
    const archiveButton = headerEl.createEl("button", {
      cls: "icon-button",
    });
    setIcon(archiveButton, "trash");
    archiveButton.onclick = () => {
      if (confirm(`Are you sure you want to delete target "${target.name}"?`)) {
        this.plugin.settings.targets.remove(target);
        this.renderContent();
      }
    };

    const trackingEl = targetEl.createDiv({ cls: "target-tracking" });
    trackingEl.createEl("p", {
      text: `${target instanceof WordCountTarget ? "Word count" : "Time"} in ${target.path || "entire vault"}:`,
    });

    const progressEl = targetEl.createDiv({ cls: "target-progress" });
    const totalProgress = Object.values(target.getProgress()).reduce(
      (acc, val) => acc + val,
      0,
    );
    const progressBar = new ProgressBarComponent(progressEl);
    progressBar.setValue(Math.min((totalProgress / target.target) * 100, 100));
    const footerEl = targetEl.createEl("div", { cls: "target-footer" });
    if (target instanceof WordCountTarget) {
      footerEl.createDiv({
        text: `${totalProgress} / ${target.target} words`,
      });
    } else if (target instanceof TimeTarget) {
      footerEl.createDiv({
        text: `${msToStr(totalProgress)} / ${msToStr(target.target)}`,
      });
    }
    if (target.period !== "none") {
      footerEl.createDiv({ text: `Repeats ${target.period}` });
    }
  }

  // Render the target in editing mode
  private renderEditingTarget(container: HTMLElement, target: Target) {
    const targetEl = container.createDiv({ cls: "target-item editing" });
    const editingState = this.editingStates.get(target.id);
    if (!editingState) return;

    // Name input field
    const nameInput = targetEl.createEl("input", {
      type: "text",
      placeholder: "Target Name",
      value: editingState.name,
    });
    nameInput.oninput = (e) => {
      editingState.name = (e.target as HTMLInputElement).value;
    };

    // Path input field
    const pathInput = targetEl.createEl("input", {
      type: "text",
      placeholder: "File or Folder Path (leave empty for entire vault)",
      value: editingState.path,
    });
    pathInput.oninput = (e) => {
      editingState.path = (e.target as HTMLInputElement).value;
    };

    // Period select field
    const periodSelect = targetEl.createEl("select");
    const periods = ["none", "daily", "weekly"];
    for (const period of periods) {
      const option = periodSelect.createEl("option", {
        text: period.charAt(0).toUpperCase() + period.slice(1),
        value: period,
      });
      if (editingState.period === period) {
        option.selected = true;
      }
    }
    periodSelect.onchange = (e) => {
      editingState.period = (e.target as HTMLSelectElement).value as
        | "none"
        | "daily"
        | "weekly";
    };

    // Target amount input
    const targetInputContainer = targetEl.createDiv({
      cls: "target-input-container",
    });
    const targetInputEl = targetInputContainer.createEl("input", {
      type: "number",
      placeholder:
        target instanceof WordCountTarget ? "Target Word Count" : "Target Time",
      value:
        target instanceof WordCountTarget
          ? editingState.target.toString()
          : (
              editingState.target / (target as TimeTarget).multiplier
            ).toString(),
    });
    let targetDurationSelect: HTMLSelectElement | null = null;
    if (target instanceof TimeTarget) {
      targetDurationSelect = targetInputContainer.createEl("select");
      const timeOptions = [
        { label: "Seconds", value: 1000 },
        { label: "Minutes", value: 60000 },
        { label: "Hours", value: 3600000 },
      ];
      for (const optionData of timeOptions) {
        const option = targetDurationSelect.createEl("option", {
          text: optionData.label,
          value: optionData.value.toString(),
        });
        if (editingState.multiplier === optionData.value) {
          option.selected = true;
        }
      }
      targetDurationSelect.onchange = (e) => {
        const multiplier = parseInt((e.target as HTMLSelectElement).value);
        editingState.multiplier = multiplier;
        editingState.target = parseInt(targetInputEl.value) * multiplier;
      };
    }
    targetInputEl.oninput = (e) => {
      editingState.target =
        parseInt((e.target as HTMLInputElement).value) *
        (editingState.multiplier || 1);
    };
    const buttonContainer = targetEl.createDiv({});
    const saveButton = buttonContainer.createEl("button", { text: "Save" });
    saveButton.onclick = () => {
      if (editingState.name.trim() === "") {
        alert("Target name cannot be empty.");
        return;
      }
      if (isNaN(editingState.target) || editingState.target <= 0) {
        alert(
          `${
            target instanceof WordCountTarget ? "Word count" : "Time"
          } target must be a positive number.`,
        );
        return;
      }
      const isPathValid =
        editingState.path.trim() === "" ||
        this.plugin.app.vault.getAbstractFileByPath(editingState.path) !== null;
      if (!isPathValid) {
        alert("The specified path does not exist in the vault.");
        return;
      }
      target.name = editingState.name;
      if (target.path !== editingState.path) {
        if (confirm("Changing the path will reset progress. Continue?")) {
          target.path = editingState.path;
          this.plugin.targetManager.setupProgressForTarget(target);
        } else {
          return;
        }
        this.plugin.targetManager.setupProgressForTarget(target);
      }
      target.path = editingState.path;
      target.period = editingState.period;
      target.target = editingState.target;
      if (target instanceof TimeTarget) {
        target.multiplier = editingState.multiplier;
      }
      this.editingStates.delete(target.id);
      this.renderContent();
      this.plugin.forceSave();
    };
    const cancelButton = buttonContainer.createEl("button", {
      text: "Cancel",
    });
    cancelButton.onclick = () => {
      this.editingStates.delete(target.id);
      this.renderContent();
    };
  }

  renderContent() {
    const container = this.contentEl;
    container.empty();

    // Header
    const header = container.createDiv({ cls: "target-view-header" });
    header.createEl("h1", { text: "My Targets" });

    // Targets List
    const targets = container.createDiv({ cls: "targets-container" });
    for (const target of this.plugin.settings.targets) {
      this.renderTarget(targets, target);
    }

    // New Target Buttons
    const buttonsEl = container.createDiv({ cls: "target-view-buttons" });
    const addWordCountButton = buttonsEl.createDiv().createEl("button", {
      text: "New Word Count Target",
    });
    addWordCountButton.onclick = () => {
      const target = this.plugin.targetManager.newTarget("wordCount");
      this.editingStates.set(target.id, {
        name: target.name,
        path: target.path,
        period: target.period,
        target: target.target,
        multiplier: 1,
      } as EditingState);
      this.renderContent();
    };
    const addTimeButton = buttonsEl.createDiv().createEl("button", {
      text: "New Time Target",
    });
    addTimeButton.onclick = () => {
      const target = this.plugin.targetManager.newTarget("time") as TimeTarget;
      this.editingStates.set(target.id, {
        name: target.name,
        path: target.path,
        period: target.period,
        target: target.target,
        multiplier: target.multiplier,
      } as EditingState);
      this.renderContent();
    };
  }
}
