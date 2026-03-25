import { useMemo, useState } from 'react';
import { Bell, Database, Monitor, Settings, Shield, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';

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
  { id: 'general', label: '일반', description: '앱 기본 동작과 화면 옵션', icon: Settings },
  { id: 'viewer', label: '뷰어', description: '이미지와 동영상 보기 환경', icon: Monitor },
  { id: 'data', label: '데이터', description: '백업과 파일 경로 관련 설정', icon: Database },
  { id: 'notifications', label: '알림', description: '알림 표시 방식과 우선순위', icon: Bell },
  { id: 'security', label: '보안', description: '접근 제어와 기록 관리', icon: Shield },
];

export function AppSettingsModal({ open, onOpenChange }: AppSettingsModalProps) {
  const [activeSection, setActiveSection] = useState('general');

  const currentSection = useMemo(
    () => sections.find((section) => section.id === activeSection) ?? sections[0],
    [activeSection]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(1400px,96vw)] h-[88vh] p-0 gap-0 bg-discord-bg border-gray-700 text-discord-text overflow-hidden [&>button]:hidden">
        <DialogTitle className="sr-only">환경설정</DialogTitle>

        <div className="flex h-full min-h-0">
          <aside className="w-[280px] shrink-0 border-r border-gray-700 bg-discord-sidebar">
            <div className="px-5 py-4 border-b border-gray-700">
              <h2 className="text-base font-semibold text-white">환경설정</h2>
              <p className="text-xs text-discord-muted mt-1">앱 전반 옵션을 관리합니다.</p>
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
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
