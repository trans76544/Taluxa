export interface CarouselMetricsInput {
  itemCount: number;
  itemStepWidth: number;
  viewportWidth: number;
}

export interface CarouselMoveInput {
  currentIndex: number;
  maxIndex: number;
  moveStep: number;
}

export function getVisibleCarouselCount(viewportWidth: number, itemStepWidth: number): number {
  if (!Number.isFinite(viewportWidth) || !Number.isFinite(itemStepWidth) || itemStepWidth <= 0) {
    return 1;
  }

  return Math.max(1, Math.floor(viewportWidth / itemStepWidth));
}

export function getMaxCarouselIndex(itemCount: number, visibleCount: number): number {
  return Math.max(0, itemCount - Math.max(1, visibleCount));
}

export function getCarouselMoveStep(visibleCount: number): number {
  return Math.max(1, visibleCount - 1);
}

export function getNextCarouselIndex(input: CarouselMoveInput): number {
  if (input.maxIndex <= 0) {
    return 0;
  }

  if (input.currentIndex >= input.maxIndex) {
    return 0;
  }

  const nextIndex = input.currentIndex + Math.max(1, input.moveStep);
  return nextIndex > input.maxIndex ? input.maxIndex : nextIndex;
}

export function getPreviousCarouselIndex(input: CarouselMoveInput): number {
  if (input.maxIndex <= 0) {
    return 0;
  }

  if (input.currentIndex <= 0) {
    return input.maxIndex;
  }

  const previousIndex = input.currentIndex - Math.max(1, input.moveStep);
  return previousIndex < 0 ? 0 : previousIndex;
}

export function clampCarouselIndex(currentIndex: number, maxIndex: number): number {
  if (maxIndex <= 0) {
    return 0;
  }

  return Math.min(maxIndex, Math.max(0, currentIndex));
}

export function getCarouselMetrics(input: CarouselMetricsInput) {
  const visibleCount = getVisibleCarouselCount(input.viewportWidth, input.itemStepWidth);
  const maxIndex = getMaxCarouselIndex(input.itemCount, visibleCount);

  return {
    isOverflowing: maxIndex > 0,
    maxIndex,
    moveStep: getCarouselMoveStep(visibleCount),
    visibleCount,
  };
}
