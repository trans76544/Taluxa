import { useEffect, useRef, useState } from 'react';
import type { ReactNode, Ref } from 'react';
import {
  clampCarouselIndex,
  getCarouselMetrics,
  getNextCarouselIndex,
  getPreviousCarouselIndex,
} from './detailCarouselLogic';

interface DetailCarouselProps {
  label: string;
  previousLabel: string;
  nextLabel: string;
  children: ReactNode;
  itemCount: number;
  itemStepFallback: number;
  trackClassName: string;
  as?: 'div' | 'ul';
}

function readGap(track: HTMLElement | null) {
  if (!track) {
    return 0;
  }

  const styles = getComputedStyle(track);
  return Number.parseFloat(styles.columnGap || styles.gap || '0') || 0;
}

export function DetailCarousel({
  label,
  previousLabel,
  nextLabel,
  children,
  itemCount,
  itemStepFallback,
  trackClassName,
  as = 'div',
}: DetailCarouselProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | HTMLUListElement | null>(null);
  const [itemStepWidth, setItemStepWidth] = useState(itemStepFallback);
  const [position, setPosition] = useState(0);
  const [metrics, setMetrics] = useState(() =>
    getCarouselMetrics({
      itemCount,
      itemStepWidth: itemStepFallback,
      viewportWidth: 0,
    })
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) {
      return;
    }
    const measuredViewport = viewport;
    const measuredTrack = track;

    function recalculate() {
      const firstItem = measuredTrack.firstElementChild as HTMLElement | null;
      const measuredWidth = firstItem?.getBoundingClientRect().width ?? 0;
      const nextStepWidth = measuredWidth > 0 ? measuredWidth + readGap(measuredTrack) : itemStepFallback;
      const nextMetrics = getCarouselMetrics({
        itemCount,
        itemStepWidth: nextStepWidth,
        viewportWidth: measuredViewport.clientWidth,
      });

      setItemStepWidth(nextStepWidth);
      setMetrics(nextMetrics);
      setPosition((currentPosition) => clampCarouselIndex(currentPosition, nextMetrics.maxIndex));
    }

    recalculate();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', recalculate);
      return () => window.removeEventListener('resize', recalculate);
    }

    const observer = new ResizeObserver(recalculate);
    observer.observe(viewport);

    return () => observer.disconnect();
  }, [itemCount, itemStepFallback]);

  function movePrevious() {
    setPosition((currentPosition) =>
      getPreviousCarouselIndex({
        currentIndex: currentPosition,
        maxIndex: metrics.maxIndex,
        moveStep: metrics.moveStep,
      })
    );
  }

  function moveNext() {
    setPosition((currentPosition) =>
      getNextCarouselIndex({
        currentIndex: currentPosition,
        maxIndex: metrics.maxIndex,
        moveStep: metrics.moveStep,
      })
    );
  }

  const isOverflowing = metrics.isOverflowing;
  const transform = `translate3d(${-position * itemStepWidth}px, 0, 0)`;

  return (
    <div className={`detail-carousel${isOverflowing ? ' is-overflowing' : ''}`} data-carousel-label={label}>
      {isOverflowing && (
        <button
          aria-label={previousLabel}
          className="detail-carousel__control detail-carousel__control--prev"
          type="button"
          onClick={movePrevious}
        >
          {'<'}
        </button>
      )}
      <div className="detail-carousel__viewport" ref={viewportRef}>
        {as === 'ul' ? (
          <ul
            className={`detail-carousel__track ${trackClassName}`}
            ref={trackRef as Ref<HTMLUListElement>}
            style={{ transform }}
          >
            {children}
          </ul>
        ) : (
          <div
            className={`detail-carousel__track ${trackClassName}`}
            ref={trackRef as Ref<HTMLDivElement>}
            style={{ transform }}
          >
            {children}
          </div>
        )}
      </div>
      {isOverflowing && (
        <button
          aria-label={nextLabel}
          className="detail-carousel__control detail-carousel__control--next"
          type="button"
          onClick={moveNext}
        >
          {'>'}
        </button>
      )}
    </div>
  );
}
