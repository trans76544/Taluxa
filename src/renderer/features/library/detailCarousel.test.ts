import { describe, expect, it } from 'vitest';
import {
  clampCarouselIndex,
  getCarouselMetrics,
  getCarouselMoveStep,
  getMaxCarouselIndex,
  getNextCarouselIndex,
  getPreviousCarouselIndex,
  getVisibleCarouselCount,
} from './detailCarouselLogic';

describe('detail carousel helpers', () => {
  it('reports a non-overflowing row when all items fit', () => {
    expect(
      getCarouselMetrics({
        itemCount: 3,
        itemStepWidth: 160,
        viewportWidth: 520,
      })
    ).toEqual({
      isOverflowing: false,
      maxIndex: 0,
      moveStep: 2,
      visibleCount: 3,
    });
  });

  it('calculates the final valid index for overflowing rows', () => {
    expect(getVisibleCarouselCount(500, 160)).toBe(3);
    expect(getMaxCarouselIndex(8, 3)).toBe(5);
    expect(
      getCarouselMetrics({
        itemCount: 8,
        itemStepWidth: 160,
        viewportWidth: 500,
      })
    ).toMatchObject({
      isOverflowing: true,
      maxIndex: 5,
      visibleCount: 3,
    });
  });

  it('uses a page-sized move step while keeping one card of continuity', () => {
    expect(getCarouselMoveStep(1)).toBe(1);
    expect(getCarouselMoveStep(2)).toBe(1);
    expect(getCarouselMoveStep(5)).toBe(4);
  });

  it('loops next movement from the final position back to the beginning', () => {
    expect(getNextCarouselIndex({ currentIndex: 3, maxIndex: 5, moveStep: 2 })).toBe(5);
    expect(getNextCarouselIndex({ currentIndex: 4, maxIndex: 5, moveStep: 2 })).toBe(5);
    expect(getNextCarouselIndex({ currentIndex: 5, maxIndex: 5, moveStep: 2 })).toBe(0);
    expect(getNextCarouselIndex({ currentIndex: 0, maxIndex: 0, moveStep: 2 })).toBe(0);
  });

  it('loops previous movement from the beginning to the final position', () => {
    expect(getPreviousCarouselIndex({ currentIndex: 4, maxIndex: 5, moveStep: 2 })).toBe(2);
    expect(getPreviousCarouselIndex({ currentIndex: 1, maxIndex: 5, moveStep: 2 })).toBe(0);
    expect(getPreviousCarouselIndex({ currentIndex: 1, maxIndex: 1, moveStep: 2 })).toBe(0);
    expect(getPreviousCarouselIndex({ currentIndex: 0, maxIndex: 5, moveStep: 2 })).toBe(5);
    expect(getPreviousCarouselIndex({ currentIndex: 0, maxIndex: 0, moveStep: 2 })).toBe(0);
  });

  it('clamps the current position after a resize changes the final valid index', () => {
    expect(clampCarouselIndex(5, 2)).toBe(2);
    expect(clampCarouselIndex(-1, 2)).toBe(0);
    expect(clampCarouselIndex(1, 0)).toBe(0);
  });
});
