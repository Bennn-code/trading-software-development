type ExportFileHandle = {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
    abort?: () => Promise<void>;
  }>;
};

type ExportPickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<ExportFileHandle>;
};

export type ExportDestination =
  | { kind: 'file'; handle: ExportFileHandle }
  | { kind: 'download' }
  | { kind: 'cancelled' };

function isAbortError(error: unknown) {
  return !!error && typeof error === 'object' && 'name' in error && (error as { name?: string }).name === 'AbortError';
}

export function isExportCancelled(error: unknown) {
  return isAbortError(error);
}

export function chooseExportDestination(filename: string, mimeType: string, extension: string, description: string): Promise<ExportDestination> {
  if (typeof window === 'undefined') return Promise.resolve({ kind: 'download' });
  const picker = (window as ExportPickerWindow).showSaveFilePicker;
  if (!picker) return Promise.resolve({ kind: 'download' });

  // Invoke before the first await in the click handler to retain browser user activation.
  try {
    return picker.call(window, {
      suggestedName: filename,
      types: [{ description, accept: { [mimeType]: [extension] } }],
    }).then(handle => ({ kind: 'file', handle } as const)).catch(error =>
      isAbortError(error) ? { kind: 'cancelled' as const } : { kind: 'download' as const },
    );
  } catch (error) {
    return Promise.resolve(isAbortError(error) ? { kind: 'cancelled' } : { kind: 'download' });
  }
}

export async function saveExportFile(blob: Blob, filename: string, destination: ExportDestination): Promise<boolean> {
  if (destination.kind === 'cancelled') return false;
  if (destination.kind === 'file') {
    const writable = await destination.handle.createWritable();
    try {
      await writable.write(blob);
      await writable.close();
    } catch (error) {
      await writable.abort?.();
      throw error;
    }
    return true;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
