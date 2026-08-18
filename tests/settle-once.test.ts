import { describe, expect, it, vi } from 'vitest';
import { settleOnce } from '../src/core/settle-once';

describe('settleOnce', () => {
	it('passes the first value through', () => {
		const spy = vi.fn();
		settleOnce(spy)('a');
		expect(spy).toHaveBeenCalledExactlyOnceWith('a');
	});

	it('ignores every later call', () => {
		const spy = vi.fn();
		const settle = settleOnce(spy);
		settle('a');
		settle('b');
		settle('c');
		expect(spy).toHaveBeenCalledExactlyOnceWith('a');
	});

	/**
	 * Regression: Obsidian's SuggestModal closes before it reports the choice.
	 * The close handler defers its cancellation by a tick, so the real
	 * selection must win even though it is raised second.
	 */
	it('lets a deferred cancellation lose to a choice raised first', async () => {
		const spy = vi.fn();
		const settle = settleOnce<string | null>(spy);

		setTimeout(() => settle(null), 0); // onClose
		settle('banner'); // onChooseSuggestion, immediately after close
		await new Promise((r) => setTimeout(r, 5));

		expect(spy).toHaveBeenCalledExactlyOnceWith('banner');
	});

	it('still cancels when nothing was chosen', async () => {
		const spy = vi.fn();
		const settle = settleOnce<string | null>(spy);

		setTimeout(() => settle(null), 0);
		await new Promise((r) => setTimeout(r, 5));

		expect(spy).toHaveBeenCalledExactlyOnceWith(null);
	});

	it('does not settle on its own', () => {
		const spy = vi.fn();
		settleOnce(spy);
		expect(spy).not.toHaveBeenCalled();
	});
});
