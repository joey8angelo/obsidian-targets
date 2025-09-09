import {
  ItemView,
  WorkspaceLeaf,
  ProgressBarComponent,
  ButtonComponent,
  setTooltip,
  setIcon,
  normalizePath,
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
  private selectedPeriod: "daily" | "weekly" = "daily";
  private selectedType: "wordCount" | "time" = "wordCount";
  private selectedYear: number = new Date().getFullYear();

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
    const normalizedPath = normalizePath(editingState.path);
    const isPathValid =
      normalizedPath === "" ||
      this.plugin.app.vault.getAbstractFileByPath(normalizedPath) !== null;
    if (!isPathValid) {
      alert("The specified path does not exist in the vault.");
      return;
    }
    if (editingState.new) {
      this.plugin.targetManager.setupProgressForTarget(target);
    } else if (target.path !== editingState.path) {
      if (confirm("Changing the path will reset progress. Continue?")) {
        target.path = editingState.path;
        this.plugin.targetManager.setupProgressForTarget(target);
      } else {
        return;
      }
    }

    // save changes to target
    target.name = editingState.name;
    target.path = normalizedPath;
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
        placeholder: "Target name",
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
      titleEl.createEl("h4", { text: target.name });
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
      let totalProgress = target.getTotalProgress();
      if (!this.plugin.settings.showNegativeProgress) {
        totalProgress = Math.max(0, totalProgress);
      }
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
        placeholder: "Path to file or folder (leave empty for entire vault)",
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

  buildHabitGrid(container: HTMLElement) {
    const headerEl = container.createDiv({ cls: "habit-grid-header" });
    headerEl.createEl("h3", { text: `${this.selectedYear} Progress` });
    const yearButtonsEl = headerEl.createDiv({ cls: "habit-year-buttons" });

    const prevYearButton = yearButtonsEl.createDiv({
      cls: "habit-year-button",
    });
    setIcon(prevYearButton, "chevron-left");
    prevYearButton.onclick = () => {
      this.selectedYear--;
      this.renderContent();
    };
    setTooltip(prevYearButton, "Previous year");

    const nextYearButton = yearButtonsEl.createDiv({
      cls: `habit-year-button ${
        this.selectedYear < new Date().getFullYear() ? "" : "disabled"
      }`,
    });
    setIcon(nextYearButton, "chevron-right");
    nextYearButton.onclick = () => {
      if (this.selectedYear < new Date().getFullYear()) {
        this.selectedYear++;
        this.renderContent();
      }
    };
    if (this.selectedYear < new Date().getFullYear()) {
      setTooltip(nextYearButton, "Next year");
    } else {
      setTooltip(nextYearButton, "Next year (not available)");
    }

    const gridEl = container.createDiv({ cls: "habit-grid" });
    const cellData = this.plugin.targetManager.getYearProgress(
      this.selectedYear,
      this.selectedPeriod,
      this.selectedType,
    );

    for (const cell of cellData) {
      const cellEl = gridEl.createDiv({ cls: "habit-cell" });
      const cellInnerEl = cellEl.createDiv({ cls: "habit-cell-inner" });
      if (cell.date < new Date()) {
        const progress = this.plugin.settings.showNegativeProgress
          ? cell.progress
          : Math.max(0, cell.progress);
        cellInnerEl.addClass("past");
        cellInnerEl.style.opacity = progress.toString();
        setTooltip(
          cellEl,
          `${cell.date.toDateString()}\nProgress: ${Math.round(progress * 100)}%`,
          { placement: "top" },
        );
      } else {
        setTooltip(cellEl, `${cell.date.toDateString()}`, { placement: "top" });
      }
    }

    const selectorsEl = container.createDiv({ cls: "habit-selectors" });
    const typeSelect = selectorsEl.createEl("select");
    const types = [
      { label: "Word count", value: "wordCount" },
      { label: "Time", value: "time" },
    ];
    for (const type of types) {
      const option = typeSelect.createEl("option", {
        text: type.label,
        value: type.value,
      });
      if (this.selectedType === type.value) {
        option.selected = true;
      }
    }
    typeSelect.onchange = (e) => {
      this.selectedType = (e.target as HTMLSelectElement).value as
        | "wordCount"
        | "time";
      this.renderContent();
    };
    const periodSelect = selectorsEl.createEl("select");
    const periods = [
      { label: "Weekly", value: "weekly" },
      { label: "Daily", value: "daily" },
    ];
    for (const period of periods) {
      const option = periodSelect.createEl("option", {
        text: period.label,
        value: period.value,
      });
      if (this.selectedPeriod === period.value) {
        option.selected = true;
      }
    }
    periodSelect.onchange = (e) => {
      this.selectedPeriod = (e.target as HTMLSelectElement).value as
        | "daily"
        | "weekly";
      this.renderContent();
    };
  }

  renderContent() {
    const container = this.contentEl;
    container.empty();

    const content = container.createDiv({ cls: "target-view-content" });

    const header = content.createDiv({ cls: "target-view-header" });
    header.createEl("h1", { text: "My targets" });

    // New Target Buttons
    const buttonsEl = content.createDiv({ cls: "target-view-new-buttons" });
    const wordCountButton = new ButtonComponent(buttonsEl);
    wordCountButton.setButtonText("New word count target");
    wordCountButton.onClick(() => {
      this.newTarget("wordCount");
    });
    const timeButton = new ButtonComponent(buttonsEl);
    timeButton.setButtonText("New time target");
    timeButton.onClick(() => {
      this.newTarget("time");
    });

    // Targets List
    const targets = content.createDiv({ cls: "targets-container" });
    for (const target of this.plugin.settings.targets) {
      this.buildTarget(targets, target);
    }

    // Habit tracker visualization
    if (this.plugin.settings.showProgressHistory) {
      const habitGrid = content.createDiv({ cls: "habit-grid-container" });
      this.buildHabitGrid(habitGrid);
    }
  }
}
