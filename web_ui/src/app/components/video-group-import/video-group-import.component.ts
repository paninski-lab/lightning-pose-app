import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProjectInfoService } from '../../project-info.service';

interface GroupedSession {
  type: 'session';
  name: string;
  files: File[];
  presentViews: string[];
  missingViews: string[];
  isComplete: boolean;
}

interface InvalidFile {
  type: 'file';
  name: string;
  file: File;
  reason: string;
}

type ListItem = GroupedSession | InvalidFile;

@Component({
  selector: 'app-video-group-import',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './video-group-import.component.html',
  styleUrl: './video-group-import.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoGroupImportComponent {
  private projectInfoService = inject(ProjectInfoService);

  /** Selected files from the file dialog. */
  files = model<File[]>([]);

  /** Whether to operate in multiview mode (grouping by session_view). */
  isMultiview = input<boolean>(true);

  /** Camera views defined in the project. */
  views = computed(() => this.projectInfoService.projectInfo?.views ?? []);

  /** Grouped and validated items to display in the list. */
  items = computed<ListItem[]>(() => {
    const currentFiles = this.files();
    const currentViews = this.views();
    const multiview = this.isMultiview();

    if (currentFiles.length === 0) return [];

    const videoExtensions = ['.mp4', '.avi', '.mov', '.mkv', '.webm'];

    if (!multiview) {
      const validSessions: GroupedSession[] = [];
      const invalidFiles: InvalidFile[] = [];

      for (const file of currentFiles) {
        const fileName = file.name;
        const lastDotIndex = fileName.lastIndexOf('.');

        if (lastDotIndex === -1) {
          invalidFiles.push({
            type: 'file',
            name: fileName,
            file,
            reason: 'No extension',
          });
          continue;
        }

        const ext = fileName.substring(lastDotIndex).toLowerCase();
        if (!videoExtensions.includes(ext)) {
          invalidFiles.push({
            type: 'file',
            name: fileName,
            file,
            reason: 'Unsupported extension',
          });
          continue;
        }

        const baseName = fileName.substring(0, lastDotIndex);
        validSessions.push({
          type: 'session',
          name: baseName,
          files: [file],
          presentViews: [],
          missingViews: [],
          isComplete: true,
        });
      }

      return [
        ...validSessions.sort((a, b) => a.name.localeCompare(b.name)),
        ...invalidFiles.sort((a, b) => a.name.localeCompare(b.name)),
      ];
    }

    const sessionMap = new Map<string, File[]>();
    const invalidFiles: InvalidFile[] = [];

    for (const file of currentFiles) {
      const fileName = file.name;
      const lastDotIndex = fileName.lastIndexOf('.');

      if (lastDotIndex === -1) {
        invalidFiles.push({
          type: 'file',
          name: fileName,
          file,
          reason: 'No extension',
        });
        continue;
      }

      const ext = fileName.substring(lastDotIndex).toLowerCase();
      if (!videoExtensions.includes(ext)) {
        invalidFiles.push({
          type: 'file',
          name: fileName,
          file,
          reason: 'Unsupported extension',
        });
        continue;
      }

      const baseName = fileName.substring(0, lastDotIndex);

      // Find if it matches session_view pattern
      let matchedView: string | undefined;
      // We sort views by length descending to match longest view name first (e.g. cam0_top vs cam0)
      const sortedViews = [...currentViews].sort((a, b) => b.length - a.length);

      for (const view of sortedViews) {
        if (baseName.endsWith('_' + view)) {
          matchedView = view;
          break;
        }
      }

      if (!matchedView) {
        invalidFiles.push({
          type: 'file',
          name: fileName,
          file,
          reason: 'Unrecognized view suffix',
        });
        continue;
      }

      const sessionName = baseName.substring(
        0,
        baseName.length - matchedView.length - 1,
      );
      if (!sessionName) {
        invalidFiles.push({
          type: 'file',
          name: fileName,
          file,
          reason: 'Empty session name',
        });
        continue;
      }

      if (!sessionMap.has(sessionName)) {
        sessionMap.set(sessionName, []);
      }
      sessionMap.get(sessionName)!.push(file);
    }

    const groupedSessions: ListItem[] = [];
    for (const [name, sessionFiles] of sessionMap.entries()) {
      const presentViews = sessionFiles
        .map((f) => {
          const baseName = f.name.substring(0, f.name.lastIndexOf('.'));
          return currentViews.find((v) => baseName.endsWith('_' + v));
        })
        .filter((v): v is string => !!v);

      const uniquePresentViews = Array.from(new Set(presentViews));
      const missingViews = currentViews.filter(
        (v) => !uniquePresentViews.includes(v),
      );
      const isComplete = missingViews.length === 0;

      groupedSessions.push({
        type: 'session',
        name,
        files: sessionFiles,
        presentViews: uniquePresentViews,
        missingViews,
        isComplete,
      });
    }

    // Sort: Sessions first (alphabetical), then Invalid files (alphabetical)
    return [
      ...groupedSessions.sort((a, b) => a.name.localeCompare(b.name)),
      ...invalidFiles.sort((a, b) => a.name.localeCompare(b.name)),
    ];
  });

  onFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.files.set(Array.from(input.files));
    }
  }

  removeSession(item: GroupedSession) {
    const fileNamesToRemove = new Set(item.files.map((f) => f.name));
    this.files.update((prev) =>
      prev.filter((f) => !fileNamesToRemove.has(f.name)),
    );
  }

  removeFile(item: InvalidFile) {
    this.files.update((prev) => prev.filter((f) => f !== item.file));
  }
}
