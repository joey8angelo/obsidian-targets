import {
	TAbstractFile,
	TFile,
	Vault,
	Workspace,
	WorkspaceLeaf,
	MarkdownView,
} from "obsidian";
import { getWordCount, getFilesFromFolderPath } from "./utils";
import TargetTracker from "./main";
import ScheduleManager from "./scheduleManager";
import { WordCountTarget, TimeTarget } from "./target";

export default class TargetManager {
	plugin: TargetTracker;
	vault: Vault;
	workspace: Workspace;

	activeFile: TFile | null = null;
	activeFileTimestamp: number;
	scheduleManager: ScheduleManager;

	constructor(plugin: TargetTracker, vault: Vault, workspace: Workspace) {
		this.plugin = plugin;
		this.vault = vault;
		this.workspace = workspace;
		this.scheduleManager = new ScheduleManager(this.plugin, this);

		this.plugin.registerEvent(
			this.vault.on("modify", (file) => this.handleModify(file)),
		);
		this.workspace.onLayoutReady(() => {
			this.plugin.registerEvent(
				this.vault.on("create", (file) => this.handleCreate(file)),
			);
			this.scheduleManager.checkMissedResets();
			this.scheduleManager.scheduleReset();
		});
		this.plugin.registerEvent(
			this.vault.on("delete", (file) => this.handleDelete(file)),
		);
		this.plugin.registerEvent(
			this.vault.on("rename", (file, oldPath) =>
				this.handleRename(file, oldPath),
			),
		);
		this.plugin.registerEvent(
			this.workspace.on("active-leaf-change", (leaf) =>
				this.handleActiveLeafChange(leaf),
			),
		);
	}

	resetTargets(date: Date) {
		const weekday = date.getDay();
		for (const [i, target] of this.plugin.settings.targets.entries()) {
			if (
				target.period === "daily" ||
				(target.period === "weekly" &&
					weekday === this.plugin.settings.weeklyResetDay)
			) {
				this.plugin.settings.targets[i] = target.getNextTarget();
				this.archiveTarget(target, date, true);
			}
		}
	}

	deleteTarget(target: WordCountTarget | TimeTarget) {
		for (let i = 0; i < this.plugin.settings.targets.length; i++) {
			if (target.id === this.plugin.settings.targets[i].id) {
				this.plugin.settings.targets.splice(i, 1);
			}
		}
	}

	archiveTarget(
		target: WordCountTarget | TimeTarget,
		date: Date,
		inTargets = true,
	) {
		if (inTargets) {
			this.deleteTarget(target);
		}

		this.plugin.scheduleSave();
		if (target.period === "none") return;

		const newDate = new Date(date);
		newDate.setHours(0, 0, 0, 0);
		const datestr = newDate.toISOString();
		if (!(datestr in this.plugin.settings.progressHistory[target.period])) {
			this.plugin.settings.progressHistory[target.period][datestr] = {
				wordCountTarget: 0,
				wordCountProgress: 0,
				timeTarget: 0,
				timeProgress: 0,
			};
		}
		if (target instanceof WordCountTarget) {
			this.plugin.settings.progressHistory[target.period][
				datestr
			].wordCountTarget += target.target;
			this.plugin.settings.progressHistory[target.period][
				datestr
			].wordCountProgress += target.getTotalProgress();
		}
		if (target instanceof TimeTarget) {
			this.plugin.settings.progressHistory[target.period][
				datestr
			].timeTarget += target.target;
			this.plugin.settings.progressHistory[target.period][
				datestr
			].timeProgress += target.getTotalProgress();
		}
		this.plugin.scheduleSave();
	}

	async handleModify(file: TAbstractFile) {
		if (!(file instanceof TFile)) return;
		const textPromise = this.vault.cachedRead(file);
		for (const target of this.plugin.settings.targets) {
			if (target instanceof WordCountTarget) {
				target.updateProgress(
					file,
					getWordCount(
						await textPromise,
						this.plugin.settings.useCommentsInWordCount,
					),
				);
			} else if (target instanceof TimeTarget) {
				const now = Date.now();
				const elapsed = Math.min(
					this.plugin.settings.maxIdleTime,
					now - this.activeFileTimestamp,
				);
				target.updateProgress(file, elapsed);
				this.activeFileTimestamp = Date.now();
			}
			this.plugin.scheduleSave();
		}
		this.plugin.renderTargetView();
	}

	async handleCreate(file: TAbstractFile) {
		if (!(file instanceof TFile)) return;
		const textPromise = this.vault.cachedRead(file);
		for (const target of this.plugin.settings.targets) {
			if (target instanceof WordCountTarget) {
				target.updateProgress(
					file,
					getWordCount(
						await textPromise,
						this.plugin.settings.useCommentsInWordCount,
					),
				);
			}
		}
		this.plugin.scheduleSave();
		this.plugin.renderTargetView();
	}
	handleDelete(file: TAbstractFile) {
		if (!(file instanceof TFile)) return;
		for (const target of this.plugin.settings.targets) {
			if (target.isTracking(file)) {
				delete target.progress[file.path];
			}
		}
		this.plugin.scheduleSave();
		this.plugin.renderTargetView();
	}
	handleRename(file: TAbstractFile, oldPath: string) {
		if (!(file instanceof TFile)) return;
		for (const target of this.plugin.settings.targets) {
			if (target.isTracking(file)) {
				target.progress[file.path] = target.progress[oldPath] || 0;
			}
			if (target.isTrackingPath(oldPath)) {
				delete target.progress[oldPath];
			}
		}
		this.plugin.scheduleSave();
		this.plugin.renderTargetView();
	}
	handleActiveLeafChange(leaf: WorkspaceLeaf | null) {
		if (this.activeFile) {
			const now = Date.now();
			const elapsed = Math.min(
				this.plugin.settings.maxIdleTime,
				now - this.activeFileTimestamp,
			);
			for (const target of this.plugin.settings.targets) {
				if (target instanceof TimeTarget) {
					target.updateProgress(this.activeFile, elapsed);
				}
			}
		}
		if (!leaf || !(leaf.view instanceof MarkdownView)) {
			this.activeFile = null;
		} else {
			this.activeFile = leaf.view.file;
			this.activeFileTimestamp = Date.now();
		}
		this.plugin.scheduleSave();
		this.plugin.renderTargetView();
	}

	newWordCountTarget() {
		this.plugin.settings.targets.push(
			new WordCountTarget(
				crypto.randomUUID(),
				"New Target",
				"daily",
				"file",
				1000,
				{},
				"",
				{},
			),
		);
		this.plugin.scheduleSave();
		return this.plugin.settings.targets[
			this.plugin.settings.targets.length - 1
		] as WordCountTarget;
	}

	newTimeTarget() {
		this.plugin.settings.targets.push(
			new TimeTarget(
				crypto.randomUUID(),
				"New Target",
				"daily",
				"file",
				1000,
				{},
				"",
			),
		);
		this.plugin.scheduleSave();
		return this.plugin.settings.targets[
			this.plugin.settings.targets.length - 1
		] as TimeTarget;
	}

	async setupProgressForTarget(target: WordCountTarget | TimeTarget) {
		const files = getFilesFromFolderPath(this.vault, target.path);
		target.resetProgress(files);
		for (const file of files) {
			const progress =
				target instanceof TimeTarget
					? 0
					: getWordCount(
							await this.vault.cachedRead(file),
							this.plugin.settings.useCommentsInWordCount,
						);
			target.updateProgress(file, progress);
			this.plugin.scheduleSave();
		}
		this.plugin.renderTargetView();
	}
}
