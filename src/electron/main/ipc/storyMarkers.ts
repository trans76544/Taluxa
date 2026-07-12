import { ipcMain } from 'electron';
import { isPlayerStoryMarkerUpdate, type PlayerStoryMarkerUpdate } from '@shared/models/storyLandmark';

export interface StoryMarkerController {
  setStoryMarkers(update: PlayerStoryMarkerUpdate): void;
}

export function registerStoryMarkerIpc(controller: StoryMarkerController): void {
  ipcMain.handle('player:set-story-markers', (_event, input: unknown) => {
    if (!isPlayerStoryMarkerUpdate(input)) throw new Error('Invalid story marker update.');
    controller.setStoryMarkers(input);
  });
}
