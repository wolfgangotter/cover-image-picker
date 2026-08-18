import { Notice } from 'obsidian';
import type { PipelineProgress } from '../core/pipeline';

const STAGE_TEXT: Record<Parameters<PipelineProgress>[0], string> = {
	validating: 'Checking image…',
	decoding: 'Reading image…',
	resizing: 'Resizing…',
	encoding: 'Converting…',
	saving: 'Saving to vault…',
	linking: 'Updating properties…',
};

/** Only worth showing for work that actually takes a moment. */
const SHOW_AFTER_MS = 300;

/**
 * A single Notice that appears only if the pipeline is slow, then updates in
 * place. Fast desktop inserts stay silent until the success message.
 */
export class ProgressReporter {
	private notice: Notice | null = null;
	private timer: number | null = null;
	private latest = '';

	start(): PipelineProgress {
		this.timer = window.setTimeout(() => {
			this.timer = null;
			this.notice = new Notice(this.latest || 'Working…', 0);
		}, SHOW_AFTER_MS);

		return (stage) => {
			this.latest = STAGE_TEXT[stage];
			this.notice?.setMessage(this.latest);
		};
	}

	stop(): void {
		if (this.timer !== null) {
			window.clearTimeout(this.timer);
			this.timer = null;
		}
		this.notice?.hide();
		this.notice = null;
	}
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
