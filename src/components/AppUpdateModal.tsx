import { AlertTriangle, Download, Loader2, RefreshCw } from 'lucide-react';
import type { AppUpdateState } from '../types';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';

interface AppUpdateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  updateState: AppUpdateState;
  onCheck: () => void;
  onDownload: () => void;
  onInstall: () => void;
}

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export function AppUpdateModal({
  open,
  onOpenChange,
  updateState,
  onCheck,
  onDownload,
  onInstall,
}: AppUpdateModalProps) {
  const isChecking = updateState.status === 'checking';
  const isDownloading = updateState.status === 'downloading';
  const isDownloaded = updateState.status === 'downloaded';
  const canDownload = updateState.updateAvailable && !isDownloading && !isDownloaded;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-xl border-gray-700 bg-discord-bg text-discord-text">
        <DialogHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-yellow-500/15 text-yellow-400">
            {isChecking || isDownloading
              ? <Loader2 className="h-6 w-6 animate-spin" />
              : <AlertTriangle className="h-6 w-6" />}
          </div>
          <DialogTitle>Local ERP 업데이트</DialogTitle>
          <DialogDescription className="leading-6 text-discord-muted">
            {updateState.updateAvailable
              ? '새로운 버전을 사용할 수 있습니다.'
              : updateState.status === 'disabled'
                ? '자동 업데이트 확인은 설치된 앱에서 사용할 수 있습니다.'
                : updateState.status === 'not-available'
                  ? '현재 최신 버전을 사용하고 있습니다.'
                  : updateState.status === 'error'
                    ? '업데이트 정보를 확인하지 못했습니다.'
                    : '새 버전이 있는지 확인하고 있습니다.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-lg border border-gray-700 bg-discord-sidebar p-4 text-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="text-discord-muted">현재 버전</span>
            <span className="font-medium text-white">v{updateState.currentVersion}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-discord-muted">신규 버전</span>
            <span className={updateState.updateAvailable ? 'font-medium text-yellow-400' : 'text-white'}>
              {updateState.latestVersion ? `v${updateState.latestVersion}` : '-'}
            </span>
          </div>
        </div>

        {isDownloading && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-discord-muted">
              <span>업데이트 다운로드 중</span>
              <span>{updateState.progress.toFixed(0)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-700">
              <div
                className="h-full rounded-full bg-discord-accent transition-[width]"
                style={{ width: `${updateState.progress}%` }}
              />
            </div>
            <div className="text-right text-xs text-discord-muted">
              {formatBytes(updateState.transferred)} / {formatBytes(updateState.total)}
            </div>
          </div>
        )}

        {isDownloaded && (
          <p className="rounded-lg border border-green-700/50 bg-green-950/30 px-4 py-3 text-sm leading-6 text-green-200">
            업데이트 다운로드가 완료되었습니다. 앱을 재시작하면 새 버전이 설치됩니다.
          </p>
        )}

        {updateState.error && (
          <p className="rounded-lg border border-red-700/50 bg-red-950/30 px-4 py-3 text-sm leading-6 text-red-200">
            {updateState.error}
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-discord-text hover:bg-discord-hover"
          >
            닫기
          </Button>
          {isDownloaded ? (
            <Button type="button" onClick={onInstall} className="bg-discord-accent text-white hover:bg-blue-600">
              <RefreshCw className="mr-2 h-4 w-4" />
              재시작 후 설치
            </Button>
          ) : canDownload ? (
            <Button type="button" onClick={onDownload} className="bg-yellow-600 text-white hover:bg-yellow-700">
              <Download className="mr-2 h-4 w-4" />
              업데이트 다운로드
            </Button>
          ) : (
            <Button
              type="button"
              onClick={onCheck}
              disabled={isChecking || isDownloading || updateState.status === 'disabled'}
              className="bg-discord-accent text-white hover:bg-blue-600"
            >
              {isChecking
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <RefreshCw className="mr-2 h-4 w-4" />}
              다시 확인
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
