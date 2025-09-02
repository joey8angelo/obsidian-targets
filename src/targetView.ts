import {
  ItemView,
  WorkspaceLeaf,
  ProgressBarComponent,
  ButtonComponent,
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
  new: boolean;
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
    this.renderContent();
  }

  async onClose() {}

  private newTarget(type: "wordCount" | "time") {
    let target = this.plugin.targetManager.newTarget(type);

    this.editingStates.set(target.id, {
      name: target.name,
      path: target.path,
      period: target.period,
      target: target.target,
      multiplier: target instanceof TimeTarget ? target.multiplier : 1,
      new: true,
    } as EditingState);
    this.renderContent();
  }

  private deleteTarget(target: Target, force: boolean = false) {
    if (
      force ||
      confirm(`Are you sure you want to delete target "${target.name}"?`)
    ) {
      this.plugin.settings.targets.remove(target);
      this.editingStates.delete(target.id);
      this.renderContent();
    }
  }

  private saveTarget(target: Target, editingState: EditingState) {
    // check for valid name
    if (editingState.name.trim() === "") {
      alert("Target name cannot be empty.");
      return;
    }

    // check for valid target
    if (isNaN(editingState.target) || editingState.target <= 0) {
      alert(
        `${
          target instanceof WordCountTarget ? "Word count" : "Time"
        } target must be a positive number.`,
      );
      return;
    }

    // check for valid path
    const isPathValid =
      editingState.path.trim() === "" ||
      this.plugin.app.vault.getAbstractFileByPath(editingState.path) !== null;
    if (!isPathValid) {
      alert("The specified path does not exist in the vault.");
      return;
    }
    target.name = editingState.name;
    if (target.path !== editingState.path) {
      if (
        editingState.new ||
        confirm("Changing the path will reset progress. Continue?")
      ) {
        target.path = editingState.path;
        this.plugin.targetManager.setupProgressForTarget(target);
      } else {
        return;
      }
    }

    // save changes to target
    target.path = editingState.path;
    target.period = editingState.period;
    target.target = editingState.target;
    if (target instanceof TimeTarget) {
      target.multiplier = editingState.multiplier;
    }

    this.editingStates.delete(target.id);

    this.renderContent();
    this.plugin.forceSave();
  }

  private cancelSave(target: Target, editingState: EditingState) {
    if (editingState.new) {
      this.deleteTarget(target, true);
    } else {
      this.editingStates.delete(target.id);
      this.renderContent();
    }
  }

  private editTarget(target: Target) {
    this.editingStates.set(target.id, {
      name: target.name,
      path: target.path,
      period: target.period,
      target: target.target,
      multiplier: target instanceof TimeTarget ? target.multiplier : 1,
      new: false,
    } as EditingState);
    this.renderContent();
  }

  private buildHeader(
    container: HTMLElement,
    target: Target,
    editingState: EditingState | undefined,
  ) {
    const titleEl = container.createDiv({ cls: "target-title" });
    if (editingState) {
      const nameInput = titleEl.createEl("input", {
        type: "text",
        placeholder: "Target Name",
        value: editingState.name,
      });
      nameInput.oninput = (e) => {
        editingState.name = (e.target as HTMLInputElement).value;
      };

      const periodSelect = container.createEl("select", {
        cls: "period-select",
      });
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
      const saveButton = new ButtonComponent(container);
      saveButton.setIcon("save");
      saveButton.onClick(() => {
        this.saveTarget(target, editingState);
      });
      saveButton.setTooltip("Save changes");
      const cancelButton = new ButtonComponent(container);
      cancelButton.setIcon("cross");
      cancelButton.onClick(() => {
        this.cancelSave(target, editingState);
      });
      cancelButton.setTooltip("Discard changes");
    } else {
      titleEl.createEl("h2", { text: target.name });
      if (target.period !== "none") {
        titleEl.createEl("span", {
          text: `${target.period}`,
          cls: "target-period",
        });
      }
      const editButton = new ButtonComponent(container);
      editButton.setIcon("pencil");
      editButton.onClick(() => this.editTarget(target));
      editButton.setTooltip(`Edit ${target.name}`);
      const deleteButton = new ButtonComponent(container);
      deleteButton.setIcon("trash");
      deleteButton.onClick(() => this.deleteTarget(target));
      deleteButton.setTooltip(`Delete ${target.name}`);
    }
  }

  private buildFooter(
    container: HTMLElement,
    target: Target,
    editingState: EditingState | undefined,
  ) {
    if (editingState) {
      const targetInputContainer = container.createDiv({
        cls: "target-input-container",
      });
      const targetInputEl = targetInputContainer.createEl("input", {
        type: "number",
        placeholder:
          target instanceof WordCountTarget
            ? "Target Word Count"
            : "Target Time",
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
    } else {
      const progressEl = container.createDiv({ cls: "target-progress" });
      const totalProgress = Object.values(target.getProgress()).reduce(
        (acc, val) => acc + val,
        0,
      );
      const progressBar = new ProgressBarComponent(progressEl);
      progressBar.setValue(
        Math.min((totalProgress / target.target) * 100, 100),
      );
      const progressLabelEl = progressEl.createEl("div", {
        cls: "target-footer",
      });
      if (target instanceof WordCountTarget) {
        progressLabelEl.createDiv({
          text: `${totalProgress} / ${target.target} words`,
        });
      } else if (target instanceof TimeTarget) {
        progressLabelEl.createDiv({
          text: `${msToStr(totalProgress)} / ${msToStr(target.target)}`,
        });
      }
    }
  }

  private buildTarget(container: HTMLElement, target: Target) {
    const editingState = this.editingStates.get(target.id);

    const targetEl = container.createDiv({
      cls: `target-container ${editingState ? "editing" : ""}`,
    });

    const headerEl = targetEl.createDiv({ cls: "target-header" });
    this.buildHeader(headerEl, target, editingState);

    if (editingState) {
      const pathInput = targetEl.createEl("input", {
        cls: "path-input",
        type: "text",
        placeholder: "File or Folder Path (leave empty for entire vault)",
        value: editingState.path,
      });
      pathInput.oninput = (e) => {
        editingState.path = (e.target as HTMLInputElement).value;
      };
    } else {
      const trackingEl = targetEl.createDiv({ cls: "target-tracking" });
      trackingEl.createEl("p", {
        text: `Tracking: ${target.path || "entire vault"}`,
      });
    }

    this.buildFooter(targetEl, target, editingState);
  }

  private buildButton(
    container: HTMLElement,
    value: string,
    onClick: () => void,
    type: "icon" | "text",
  ) {
    const button = container.createEl("button", {
      cls: type === "icon" ? "icon-button" : "text-button",
    });
    if (type === "icon") {
      setIcon(button, value);
    } else {
      button.setText(value);
    }
    button.onclick = onClick;
    return button;
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
      this.buildTarget(targets, target);
    }

    // New Target Buttons
    const buttonsEl = container.createDiv({ cls: "target-view-buttons" });
    this.buildButton(
      buttonsEl,
      "New Word Count Target",
      () => {
        this.newTarget("wordCount");
      },
      "text",
    );
    this.buildButton(
      buttonsEl,
      "New Time Target",
      () => {
        this.newTarget("time");
      },
      "text",
    );
  }
}
