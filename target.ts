import { TAbstractFile, TFile } from "obsidian";

interface FilesProgress {
	[path: string]: number;
}

export class Target {
	id: string; // unique identifier
	name: string; // name of the target
	type: "wordCount" | "time";
	period: "daily" | "weekly" | "none";
	scope: "file" | "folder" | "vault";
	target: number; // the target value
	progress: FilesProgress; // progress of all files being tracked
	// date when the target should be completed by, this target will
	// be marked expired after this date. If the period is not 'none',
	// a new target will be created with the same parameters for the next period.
	path: string; // path of the file or folder being tracked
	isEditing: boolean;

	constructor(
		id: string,
		name: string,
		type: "wordCount" | "time",
		period: "daily" | "weekly" | "none",
		scope: "file" | "folder" | "vault",
		target: number,
		progress: FilesProgress,
		path: string,
	) {
		this.id = id;
		this.name = name;
		this.type = type;
		this.period = period;
		this.scope = scope;
		this.target = target;
		this.progress = progress;
		this.path = path;
	}

	isTracking(file: TAbstractFile): boolean {
		if (!(file instanceof TFile)) return false;
		return this.isTrackingPath(file.path);
	}

	isTrackingPath(path: string): boolean {
		if (path.startsWith(this.path)) {
			return true;
		}
		return false;
	}
}

export class WordCountTarget extends Target {
	previousProgress: FilesProgress;

	constructor(
		id: string,
		name: string,
		period: "daily" | "weekly" | "none",
		scope: "file" | "folder" | "vault",
		target: number,
		progress: FilesProgress,
		path: string,
		previousProgress?: FilesProgress,
	) {
		super(id, name, "wordCount", period, scope, target, progress, path);
		if (!previousProgress) {
			this.previousProgress = { ...progress };
		} else {
			this.previousProgress = previousProgress;
		}
	}

	getNextTarget() {
		const nextTarget = new WordCountTarget(
			crypto.randomUUID(),
			this.name,
			this.period,
			this.scope,
			this.target,
			{ ...this.progress },
			this.path,
		);
		return nextTarget;
	}

	getProgress(): FilesProgress {
		const progress = { ...this.progress };
		for (const key in this.progress) {
			if (key in this.previousProgress) {
				progress[key] -= this.previousProgress[key];
			}
		}
		return progress;
	}

	getTotalProgress(): number {
		const progress = this.getProgress();
		let total = 0;
		for (const key in progress) {
			total += progress[key];
		}
		return total;
	}

	updateProgress(file: TFile, count: number) {
		if (this.isTracking(file)) {
			this.progress[file.path] = count;
		}
	}

	resetProgress(files: TFile[]) {
		this.progress = {};
		this.previousProgress = {};
		for (const file of files) {
			if (this.isTracking(file)) {
				this.progress[file.path] = 0;
				this.previousProgress[file.path] = 0;
			}
		}
	}
}

export class TimeTarget extends Target {
	multiplier = 1000;
	constructor(
		id: string,
		name: string,
		period: "daily" | "weekly" | "none",
		scope: "file" | "folder" | "vault",
		target: number,
		progress: FilesProgress,
		path: string,
	) {
		super(id, name, "time", period, scope, target, progress, path);
	}

	getNextTarget() {
		const nextTarget = new TimeTarget(
			crypto.randomUUID(),
			this.name,
			this.period,
			this.scope,
			this.target,
			{ ...this.progress },
			this.path,
		);
		for (const key in nextTarget.progress) {
			nextTarget.progress[key] = 0;
		}
		return nextTarget;
	}

	getProgress(): FilesProgress {
		return this.progress;
	}

	getTotalProgress(): number {
		let total = 0;
		for (const key in this.progress) {
			total += this.progress[key];
		}
		return total;
	}

	updateProgress(file: TFile, time: number) {
		if (this.isTracking(file)) {
			if (!this.progress[file.path]) {
				this.progress[file.path] = 0;
			}
			this.progress[file.path] += time;
		}
	}

	resetProgress(files: TFile[]) {
		this.progress = {};
		for (const file of files) {
			if (this.isTracking(file)) {
				this.progress[file.path] = 0;
			}
		}
	}
}
