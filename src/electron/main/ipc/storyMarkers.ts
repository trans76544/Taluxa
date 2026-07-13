import { ipcMain } from 'electron';
import { isPlayerStoryMarkerUpdate, isStoryMarkerDiagnostic, type PlayerStoryMarkerUpdate, type StoryMarkerDiagnostic } from '@shared/models/storyLandmark';

export interface StoryMarkerController {
  setStoryMarkers(update: PlayerStoryMarkerUpdate): boolean;
}

function formatDiagnostic(diagnostic: StoryMarkerDiagnostic): string {
  if (diagnostic.stage === 'request-error') return '[story-markers] stage=request-error';
  if (diagnostic.stage === 'normalized') {
    return `[story-markers] stage=normalized chapters=${diagnostic.chapterCount} markers=${diagnostic.markerCount}`;
  }
  return `[story-markers] stage=response status=${diagnostic.status} itemChapters=${diagnostic.itemChapterCount} mediaSources=${diagnostic.mediaSourceCount} selectedSourceChapters=${diagnostic.selectedMediaSourceChapterCount}`;
}

export function registerStoryMarkerIpc(controller: StoryMarkerController, logger: (message: string) => void = console.info): void {
  ipcMain.handle('player:set-story-markers', (_event, input: unknown) => {
    if (!isPlayerStoryMarkerUpdate(input)) throw new Error('Invalid story marker update.');
    const accepted = controller.setStoryMarkers(input);
    logger(`[story-markers] stage=mpv accepted=${accepted} markers=${input.markers.length}`);
  });
  ipcMain.handle('player:story-marker-diagnostic', (_event, input: unknown) => {
    if (!isStoryMarkerDiagnostic(input)) throw new Error('Invalid story marker diagnostic.');
    logger(formatDiagnostic(input));
  });
}
