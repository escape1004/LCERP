import { useEffect, useMemo, useState } from 'react';
import { Monitor, Settings, Shield, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';
import { Switch } from './ui/switch';
import { Input } from './ui/input';
import { Button } from './ui/button';
import type { Config } from '../types';

interface AppSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SettingsSection = {
  id: string;
  label: string;
  description: string;
  icon: typeof Settings;
};

const sections: SettingsSection[] = [
  { id: 'general', label: '일반', description: '앱 기본 동작과 창 옵션', icon: Settings },
  { id: 'viewer', label: '뷰어', description: '이미지와 동영상 보기 환경', icon: Monitor },
  { id: 'security', label: '보안', description: '접근 제어와 기록 관리', icon: Shield },
];

export function AppSettingsModal({ open, onOpenChange }: AppSettingsModalProps) {
  const [activeSection, setActiveSection] = useState('general');
  const [config, setConfig] = useState<Config | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [securityMessage, setSecurityMessage] = useState('');

  const currentSection = useMemo(
    () => sections.find((section) => section.id === activeSection) ?? sections[0],
    [activeSection]
  );

  useEffect(() => {
    if (!open) return;

    const preventMouseBackClose = (e: MouseEvent) => {
      if (e.button !== 3) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };

    window.addEventListener('mousedown', preventMouseBackClose, true);
    window.addEventListener('mouseup', preventMouseBackClose, true);
    window.addEventListener('auxclick', preventMouseBackClose, true);

    return () => {
      window.removeEventListener('mousedown', preventMouseBackClose, true);
      window.removeEventListener('mouseup', preventMouseBackClose, true);
      window.removeEventListener('auxclick', preventMouseBackClose, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    window.electronAPI.getConfig().then((nextConfig) => {
      if (!cancelled) {
        setConfig(nextConfig);
        setPassword('');
        setPasswordConfirm('');
        setSecurityMessage('');
      }
    }).catch((error) => {
      console.error('Failed to load app settings:', error);
    });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleRememberWindowBoundsChange = async (checked: boolean) => {
    setConfig((prev) => prev ? { ...prev, rememberWindowBounds: checked } : prev);
    setIsSaving(true);
    try {
      await window.electronAPI.setRememberWindowBounds(checked);
    } finally {
      setIsSaving(false);
    }
  };

  const renderGeneralSection = () => (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-700 bg-discord-sidebar p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-white">프로그램 위치 기억</div>
            <p className="text-sm text-discord-muted mt-2 leading-6">
              프로그램을 다시 실행할 때 마지막으로 사용한 창 위치와 크기를 그대로 복원합니다.
            </p>
          </div>
          <Switch
            checked={Boolean(config?.rememberWindowBounds)}
            onCheckedChange={handleRememberWindowBoundsChange}
            disabled={!config || isSaving}
            className="data-[state=checked]:bg-discord-accent data-[state=unchecked]:bg-gray-600"
          />
        </div>
      </div>
    </div>
  );

  const renderPlaceholderSection = () => (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl border border-gray-700 bg-discord-sidebar p-5">
        <div className="text-sm font-medium text-white">준비 중</div>
        <p className="text-sm text-discord-muted mt-2 leading-6">
          이 영역에 {currentSection.label} 설정 항목을 배치하면 됩니다.
        </p>
      </div>

      <div className="rounded-xl border border-gray-700 bg-discord-sidebar p-5">
        <div className="text-sm font-medium text-white">레이아웃 자리</div>
        <p className="text-sm text-discord-muted mt-2 leading-6">
          좌측 메뉴를 유지한 채 우측 상세 화면을 섹션별로 확장할 수 있게 비워 두었습니다.
        </p>
      </div>

      <div className="rounded-xl border border-dashed border-gray-700 bg-discord-sidebar p-5 md:col-span-2 min-h-[280px]">
        <div className="text-sm font-medium text-white">상세 설정 패널</div>
        <p className="text-sm text-discord-muted mt-2 leading-6">
          폼, 토글, 경로 선택, 단축키 설정 같은 실제 옵션을 이 영역에 추가하면 됩니다.
        </p>
      </div>
    </div>
  );

  const handleSavePassword = async () => {
    if (!password || password.length < 4) {
      setSecurityMessage('비밀번호는 4자 이상이어야 합니다.');
      return;
    }
    if (password !== passwordConfirm) {
      setSecurityMessage('비밀번호 확인이 일치하지 않습니다.');
      return;
    }

    setIsSaving(true);
    const result = await window.electronAPI.setAppPassword(password);
    setIsSaving(false);

    if (result.success) {
      setConfig((prev) => prev ? { ...prev, hasAppPassword: true } : prev);
      setPassword('');
      setPasswordConfirm('');
      setSecurityMessage('비밀번호가 설정되었습니다.');
      return;
    }

    setSecurityMessage(result.error || '비밀번호 설정에 실패했습니다.');
  };

  const handleClearPassword = async () => {
    setIsSaving(true);
    const result = await window.electronAPI.clearAppPassword();
    setIsSaving(false);

    if (result.success) {
      setConfig((prev) => prev ? { ...prev, hasAppPassword: false } : prev);
      setPassword('');
      setPasswordConfirm('');
      setSecurityMessage('비밀번호가 해제되었습니다.');
      return;
    }

    setSecurityMessage(result.error || '비밀번호 해제에 실패했습니다.');
  };

  const renderSecuritySection = () => (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-700 bg-discord-sidebar p-5">
        <div className="text-sm font-medium text-white">프로그램 비밀번호</div>
        <p className="text-sm text-discord-muted mt-2 leading-6">
          비밀번호를 설정하면 프로그램을 실행할 때마다 먼저 비밀번호를 입력해야 접근할 수 있습니다.
        </p>

        <div className="mt-5 grid gap-3 max-w-md">
          <Input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setSecurityMessage('');
            }}
            placeholder={config?.hasAppPassword ? '새 비밀번호' : '비밀번호'}
            className="bg-discord-bg border-gray-600 text-discord-text"
          />
          <Input
            type="password"
            value={passwordConfirm}
            onChange={(e) => {
              setPasswordConfirm(e.target.value);
              setSecurityMessage('');
            }}
            placeholder="비밀번호 확인"
            className="bg-discord-bg border-gray-600 text-discord-text"
          />

          {securityMessage && (
            <p className="text-sm text-discord-muted">{securityMessage}</p>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              onClick={() => void handleSavePassword()}
              className="bg-discord-accent hover:bg-blue-600 text-white"
              disabled={isSaving}
            >
              {config?.hasAppPassword ? '비밀번호 변경' : '비밀번호 설정'}
            </Button>
            {config?.hasAppPassword && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleClearPassword()}
                className="border-gray-600 hover:bg-discord-hover text-discord-text"
                disabled={isSaving}
              >
                비밀번호 해제
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[min(1400px,96vw)] h-[88vh] p-0 gap-0 bg-discord-bg border-gray-700 text-discord-text overflow-hidden [&>button]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">환경설정</DialogTitle>

        <div className="flex h-full min-h-0">
          <aside className="w-[280px] shrink-0 border-r border-gray-700 bg-discord-sidebar">
            <div className="px-5 py-4 border-b border-gray-700">
              <h2 className="text-base font-semibold text-white">환경설정</h2>
            </div>

            <nav className="p-3 space-y-1">
              {sections.map((section) => {
                const Icon = section.icon;
                const isActive = currentSection.id === section.id;

                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full flex items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors ${
                      isActive
                        ? 'bg-discord-hover text-white border border-gray-700'
                        : 'text-discord-muted border border-transparent hover:bg-discord-hover hover:text-discord-text'
                    }`}
                  >
                    <Icon className={`mt-0.5 h-4 w-4 ${isActive ? 'text-blue-400' : ''}`} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{section.label}</div>
                      <div className="text-xs text-gray-400 mt-1">{section.description}</div>
                    </div>
                  </button>
                );
              })}
            </nav>
          </aside>

          <section className="flex-1 min-w-0 flex flex-col">
            <header className="flex items-center justify-between px-6 py-5 border-b border-gray-700 bg-discord-bg">
              <div>
                <h3 className="text-lg font-semibold text-white">{currentSection.label}</h3>
                <p className="text-sm text-discord-muted mt-1">{currentSection.description}</p>
              </div>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="text-discord-muted hover:text-discord-text"
                aria-label="환경설정 닫기"
              >
                <X size={24} />
              </button>
            </header>

            <div className="flex-1 min-h-0 overflow-y-auto p-6 bg-discord-bg">
              {currentSection.id === 'general'
                ? renderGeneralSection()
                : currentSection.id === 'security'
                  ? renderSecuritySection()
                  : renderPlaceholderSection()}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
