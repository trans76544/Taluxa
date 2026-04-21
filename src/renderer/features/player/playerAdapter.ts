export function seekVideo(video: HTMLVideoElement, positionSeconds: number): void {
  if (positionSeconds >= 0) {
    video.currentTime = positionSeconds;
  }
}