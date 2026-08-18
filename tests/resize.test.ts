import { describe, expect, it } from 'vitest';
import { computeResizePlan, halvingSteps } from '../src/core/resize';
import type { ResizeSpec } from '../src/core/types';

const spec = (over: Partial<ResizeSpec> = {}): ResizeSpec => ({
	mode: 'box',
	width: 1600,
	height: 900,
	fit: 'cover',
	allowUpscale: false,
	...over,
});

const landscape = { width: 4000, height: 3000 };
const portrait = { width: 3000, height: 4000 };
const square = { width: 2000, height: 2000 };

describe('computeResizePlan', () => {
	it('passes the image through unchanged in "none" mode', () => {
		const plan = computeResizePlan(landscape, spec({ mode: 'none' }));
		expect(plan.target).toEqual(landscape);
		expect(plan.source).toEqual({ x: 0, y: 0, ...landscape });
	});

	it('scales by width, preserving aspect ratio', () => {
		const plan = computeResizePlan(landscape, spec({ mode: 'width', width: 1000 }));
		expect(plan.target).toEqual({ width: 1000, height: 750 });
	});

	it('scales by height, preserving aspect ratio', () => {
		const plan = computeResizePlan(portrait, spec({ mode: 'height', height: 1000 }));
		expect(plan.target).toEqual({ width: 750, height: 1000 });
	});

	it('refuses to upscale unless asked', () => {
		const small = { width: 200, height: 100 };
		expect(computeResizePlan(small, spec({ mode: 'width', width: 4000 })).target).toEqual(small);
		expect(
			computeResizePlan(small, spec({ mode: 'width', width: 4000, allowUpscale: true })).target,
		).toEqual({
			width: 4000,
			height: 2000,
		});
	});

	describe('fit: cover', () => {
		it('fills the box exactly and centre-crops the overflow', () => {
			const plan = computeResizePlan(landscape, spec());
			expect(plan.target).toEqual({ width: 1600, height: 900 });
			// 16:9 out of 4:3 means cropping the top and bottom, not the sides.
			expect(plan.source.width).toBe(4000);
			expect(plan.source.x).toBe(0);
			expect(plan.source.height).toBeLessThan(3000);
			expect(plan.source.y).toBeGreaterThan(0);
		});

		it('crops the sides for a portrait source', () => {
			const plan = computeResizePlan(portrait, spec());
			expect(plan.target).toEqual({ width: 1600, height: 900 });
			expect(plan.source.height).toBeLessThan(4000);
			expect(plan.source.width).toBe(3000);
		});

		it('keeps the requested aspect ratio when the source is too small to fill', () => {
			const plan = computeResizePlan({ width: 800, height: 450 }, spec());
			expect(plan.target.width / plan.target.height).toBeCloseTo(16 / 9, 2);
			expect(plan.target.width).toBeLessThanOrEqual(800);
		});

		it('centres the crop', () => {
			const plan = computeResizePlan(square, spec({ width: 1000, height: 500 }));
			expect(plan.source.y).toBe(Math.round((2000 - plan.source.height) / 2));
		});
	});

	describe('fit: contain', () => {
		it('fits inside the box without padding', () => {
			const plan = computeResizePlan(landscape, spec({ fit: 'contain' }));
			expect(plan.target.width).toBeLessThanOrEqual(1600);
			expect(plan.target.height).toBeLessThanOrEqual(900);
			expect(plan.target).toEqual({ width: 1200, height: 900 });
			expect(plan.source).toEqual({ x: 0, y: 0, ...landscape });
		});
	});

	describe('fit: stretch', () => {
		it('ignores aspect ratio', () => {
			const plan = computeResizePlan(landscape, spec({ fit: 'stretch', allowUpscale: true }));
			expect(plan.target).toEqual({ width: 1600, height: 900 });
			expect(plan.source).toEqual({ x: 0, y: 0, ...landscape });
		});

		it('caps each axis independently when upscaling is off', () => {
			const plan = computeResizePlan({ width: 1000, height: 2000 }, spec({ fit: 'stretch' }));
			expect(plan.target).toEqual({ width: 1000, height: 900 });
		});
	});

	describe('degenerate specs', () => {
		it('falls back to a single axis when the box is half-specified', () => {
			expect(computeResizePlan(landscape, spec({ height: null })).target).toEqual({
				width: 1600,
				height: 1200,
			});
			expect(computeResizePlan(landscape, spec({ width: null })).target).toEqual({
				width: 1200,
				height: 900,
			});
		});

		it('passes through when the box is entirely unspecified', () => {
			expect(computeResizePlan(landscape, spec({ width: null, height: null })).target).toEqual(
				landscape,
			);
		});

		it('never produces a zero dimension for extreme aspect ratios', () => {
			const plan = computeResizePlan({ width: 10000, height: 1 }, spec({ mode: 'width', width: 100 }));
			expect(plan.target.width).toBeGreaterThan(0);
			expect(plan.target.height).toBeGreaterThan(0);
		});

		it('rejects an impossible source', () => {
			expect(() => computeResizePlan({ width: 0, height: 10 }, spec())).toThrow();
		});
	});
});

describe('halvingSteps', () => {
	it('is empty when the downscale is 2x or less', () => {
		expect(halvingSteps(1000, 600)).toEqual([]);
		expect(halvingSteps(1000, 500)).toEqual([]);
	});

	it('halves until within 2x of the target', () => {
		// Stops once the remaining step is within 2x: 500 -> 400 is 1.25x.
		expect(halvingSteps(4000, 400)).toEqual([2000, 1000, 500]);
	});

	it('is empty when upscaling', () => {
		expect(halvingSteps(100, 800)).toEqual([]);
	});
});
