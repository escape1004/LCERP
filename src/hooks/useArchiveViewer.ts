import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '../components/ui/use-toast';
import type { ArchiveFile, ViewerFileType } from '../components/viewer/types';
import {
  filterArchiveFiles,
  getAdjacentArchiveOriginalIndex,
  getArchiveNavigationIndex,
  getNavigableArchiveFiles,
  isVideoFileName,
  prepareArchiveEntries,
} from '../components/viewer/viewerLogic';
import { getArchiveVideoHttpUrl } from '../lib/local-media';
import { exitPictureInPicture } from './pictureInPicture';

interface UseArchiveViewerOptions {
  isOpen: boolean;
  filePath: string;
  displayFilePath: string;
  fileType: ViewerFileType | null;
  detectedFileType: ViewerFileType | null;
  setLoading: (value: boolean) => void;
  setFileNotFound: (value: boolean) => void;
}

export function useArchiveViewer({
  isOpen,
  filePath,
  displayFilePath,
  fileType,
  detectedFileType,
  setLoading,
  setFileNotFound,
}: UseArchiveViewerOptions) {
  const [archiveFiles, setArchiveFiles] = useState<ArchiveFile[]>([]);
  const [archiveSearchQuery, setArchiveSearchQuery] = useState('');
  const [currentArchiveIndex, setCurrentArchiveIndex] = useState(0);
  const [currentArchiveDataUrl, setCurrentArchiveDataUrl] = useState<string | null>(null);
  const [currentArchiveText, setCurrentArchiveText] = useState<string | null>(null);
  const filteredArchiveFiles = useMemo(
    () => filterArchiveFiles(archiveFiles, archiveSearchQuery),
    [archiveFiles, archiveSearchQuery],
  );
  const navigableArchiveFiles = useMemo(
    () => getNavigableArchiveFiles(filteredArchiveFiles),
    [filteredArchiveFiles],
  );
  const currentArchiveNavigationIndex = useMemo(
    () => getArchiveNavigationIndex(navigableArchiveFiles, currentArchiveIndex),
    [currentArchiveIndex, navigableArchiveFiles],
  );

  useEffect(() => {
    setArchiveSearchQuery('');
  }, [displayFilePath, isOpen]);

  const resetArchiveState = useCallback(() => {
    setArchiveFiles([]);
    setCurrentArchiveIndex(0);
    setCurrentArchiveDataUrl(null);
    setCurrentArchiveText(null);
  }, []);

  const loadArchiveFiles = useCallback(async () => {
    try {
      setLoading(true);
      setFileNotFound(false);
      const files = await window.electronAPI.getArchiveFiles(filePath);
      const archiveEntries = prepareArchiveEntries(files);
      const supportedFileCount = archiveEntries.filter((file) => file.isSupported).length;

      if (archiveEntries.length === 0) {
        setFileNotFound(true);
        setArchiveFiles([]);
      } else {
        setArchiveFiles(archiveEntries);
        setCurrentArchiveIndex(supportedFileCount > 0 ? 0 : -1);
      }
    } catch (error) {
      console.error('압축 파일 로드 실패:', error);
      setFileNotFound(true);
      setArchiveFiles([]);
    } finally {
      setLoading(false);
    }
  }, [filePath, setFileNotFound, setLoading]);

  const loadCurrentArchiveFile = useCallback(async () => {
    if (currentArchiveIndex < 0 || currentArchiveIndex >= archiveFiles.length) return;

    setCurrentArchiveDataUrl(null);
    setCurrentArchiveText(null);
    try {
      const currentFile = archiveFiles[currentArchiveIndex];
      if (!currentFile.isSupported) return;
      const fileExt = currentFile.name.toLowerCase().split('.').pop();

      if (fileExt === 'txt') {
        const text = await window.electronAPI.getArchiveFileText(filePath, currentFile.name);
        setCurrentArchiveText(text);
        setCurrentArchiveDataUrl(null);
      } else if (isVideoFileName(currentFile.name)) {
        const streamUrl = await getArchiveVideoHttpUrl(filePath, currentFile.name);
        setCurrentArchiveDataUrl(streamUrl);
        setCurrentArchiveText(null);
      } else {
        const dataUrl = await window.electronAPI.getArchiveFileDataUrl(filePath, currentFile.name);
        setCurrentArchiveDataUrl(dataUrl);
        setCurrentArchiveText(null);
      }
    } catch (error) {
      console.error('압축 파일 로드 실패:', error);
      setCurrentArchiveDataUrl(null);
      setCurrentArchiveText(null);
    }
  }, [archiveFiles, currentArchiveIndex, filePath]);

  useEffect(() => {
    const effectiveType = fileType || detectedFileType;
    if (effectiveType === 'archive' && archiveFiles.length > 0 && currentArchiveIndex >= 0) {
      void loadCurrentArchiveFile();
    }
  }, [archiveFiles, currentArchiveIndex, detectedFileType, fileType, loadCurrentArchiveFile]);

  const selectArchiveFile = useCallback(async (targetIndex: number) => {
    if (document.pictureInPictureElement) {
      await exitPictureInPicture();
    }

    setCurrentArchiveDataUrl(null);
    setCurrentArchiveText(null);
    setCurrentArchiveIndex(targetIndex);
  }, []);

  const handlePrevious = useCallback(async () => {
    const targetIndex = getAdjacentArchiveOriginalIndex(
      navigableArchiveFiles,
      currentArchiveNavigationIndex,
      'previous',
    );
    if (targetIndex === undefined) return;
    await selectArchiveFile(targetIndex);
  }, [currentArchiveNavigationIndex, navigableArchiveFiles, selectArchiveFile]);

  const handleNext = useCallback(async () => {
    const targetIndex = getAdjacentArchiveOriginalIndex(
      navigableArchiveFiles,
      currentArchiveNavigationIndex,
      'next',
    );
    if (targetIndex === undefined) return;
    await selectArchiveFile(targetIndex);
  }, [currentArchiveNavigationIndex, navigableArchiveFiles, selectArchiveFile]);

  const handleOpenUnsupportedArchiveFile = useCallback(async (file: ArchiveFile) => {
    try {
      const result = await window.electronAPI.openArchiveFile(filePath, file.name);
      if (!result.success) {
        throw new Error(result.error || '파일을 실행하지 못했습니다.');
      }
    } catch (error) {
      toast({
        title: '파일 실행 실패',
        description: error instanceof Error ? error.message : '압축파일 내부 파일을 실행하지 못했습니다.',
        variant: 'destructive',
      });
    }
  }, [filePath]);

  return {
    archiveFiles,
    archiveSearchQuery,
    setArchiveSearchQuery,
    currentArchiveIndex,
    currentArchiveDataUrl,
    currentArchiveText,
    filteredArchiveFiles,
    navigableArchiveFiles,
    currentArchiveNavigationIndex,
    resetArchiveState,
    loadArchiveFiles,
    selectArchiveFile,
    handlePrevious,
    handleNext,
    handleOpenUnsupportedArchiveFile,
  };
}
