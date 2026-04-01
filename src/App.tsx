import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import Index from './pages/Index';
import Dashboard from './pages/Dashboard';
import NotFound from './pages/NotFound';
import { TitleBar } from './components/TitleBar';
import { LoadingOverlay } from './components/ui/loading-overlay';
import { AppSettingsModal } from './components/AppSettingsModal';
import { Input } from './components/ui/input';
import { Button } from './components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from './components/ui/dialog';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from './components/ui/context-menu';
import { useERPStore } from './hooks/useERPStore';
import type { Profile } from './types';

const queryClient = new QueryClient();
const PROFILE_COLORS = ['#5865F2', '#3BA55D', '#F97316', '#EC4899', '#0EA5E9', '#EAB308'];
const RAINBOW_PROFILE_COLOR = 'rainbow';

function normalizeProfileColor(value: string) {
  if (value === RAINBOW_PROFILE_COLOR) return value;

  const normalized = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized.toUpperCase() : PROFILE_COLORS[0];
}

function getProfileSwatchStyle(color?: string): React.CSSProperties {
  if (color === RAINBOW_PROFILE_COLOR) {
    return {
      backgroundImage: 'linear-gradient(135deg, #ff5f6d 0%, #ffc371 22%, #47cf73 44%, #3b82f6 68%, #a855f7 100%)',
    };
  }

  return {
    backgroundColor: normalizeProfileColor(color || PROFILE_COLORS[0]),
  };
}

const RouterContent = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const currentPath = window.location.hash || '#/dashboard';

    window.history.pushState({ preventBack: true }, '', currentPath);
    window.history.pushState({ preventBack: true }, '', currentPath);

    const handlePopState = () => {
      const savedPath = window.location.hash || '#/dashboard';
      window.history.pushState({ preventBack: true }, '', savedPath);
      window.history.pushState({ preventBack: true }, '', savedPath);
      navigate(savedPath.replace('#', ''));
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [navigate]);

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/category" element={<Index />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

type GateCardProps = {
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
};

function GateCard({ title, description, children, className = 'max-w-5xl' }: GateCardProps) {
  return (
    <div className={`w-full rounded-2xl border border-gray-700 bg-discord-sidebar/95 shadow-2xl ${className}`}>
      <div className="border-b border-gray-700 px-8 py-6">
        <h2 className="text-2xl font-semibold text-white">{title}</h2>
        <p className="mt-2 text-sm text-discord-muted">{description}</p>
      </div>
      <div className="p-8">{children}</div>
    </div>
  );
}

const App = () => {
  const { currentProfile, setCurrentProfile, resetForProfile } = useERPStore();
  const [isAppSettingsOpen, setIsAppSettingsOpen] = useState(false);
  const [isCheckingPassword, setIsCheckingPassword] = useState(true);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileError, setProfileError] = useState('');
  const [newProfileName, setNewProfileName] = useState('');
  const [selectedProfileColor, setSelectedProfileColor] = useState(PROFILE_COLORS[0]);
  const [customProfileColor, setCustomProfileColor] = useState(PROFILE_COLORS[0]);
  const [isProfileBusy, setIsProfileBusy] = useState(false);
  const [isCreateProfileOpen, setIsCreateProfileOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [deleteTargetProfile, setDeleteTargetProfile] = useState<Profile | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const customColorInputRef = useRef<HTMLInputElement | null>(null);

  const selectedProfileInitial = useMemo(
    () => (newProfileName.trim().charAt(0) || 'P').toUpperCase(),
    [newProfileName]
  );
  const isCustomColorSelected = !PROFILE_COLORS.includes(selectedProfileColor);

  useEffect(() => {
    const handleAuxClick = (e: MouseEvent) => {
      if (e.button === 3) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 3) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };

    document.addEventListener('auxclick', handleAuxClick, true);
    document.addEventListener('mousedown', handleMouseDown, true);

    return () => {
      document.removeEventListener('auxclick', handleAuxClick, true);
      document.removeEventListener('mousedown', handleMouseDown, true);
    };
  }, []);

  const refreshProfiles = async () => {
    const nextProfiles = await window.electronAPI.getProfiles();
    setProfiles(nextProfiles);
    return nextProfiles;
  };

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const [config, nextProfiles] = await Promise.all([
          window.electronAPI.getConfig(),
          window.electronAPI.getProfiles(),
          window.electronAPI.clearCurrentProfile(),
        ]);

        if (cancelled) return;

        setRequiresPassword(Boolean(config?.hasAppPassword));
        setProfiles(nextProfiles as Profile[]);
        setCurrentProfile(null);
        resetForProfile();
      } catch {
        if (cancelled) return;
        setRequiresPassword(false);
        setProfiles([]);
        setCurrentProfile(null);
        resetForProfile();
      } finally {
        if (!cancelled) {
          setIsCheckingPassword(false);
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [resetForProfile, setCurrentProfile]);

  const handleUnlock = async () => {
    const result = await window.electronAPI.verifyAppPassword(passwordInput);
    if (result.success) {
      setRequiresPassword(false);
      setPasswordInput('');
      setPasswordError('');
      return;
    }

    setPasswordError('비밀번호가 올바르지 않습니다.');
  };

  const handleSelectProfile = async (profile: Profile) => {
    setIsProfileBusy(true);
    setProfileError('');

    try {
      if (!window.electronAPI?.selectProfile) {
        setProfileError('프로필 선택 API를 찾을 수 없습니다. 앱을 완전히 종료 후 다시 실행하세요.');
        return;
      }

      const result = await window.electronAPI.selectProfile(profile.id);
      if (!result.success || !result.profile) {
        setProfileError(result.error || '프로필을 선택할 수 없습니다.');
        return;
      }

      resetForProfile();
      setCurrentProfile(result.profile);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : '프로필 선택 중 오류가 발생했습니다.');
    } finally {
      setIsProfileBusy(false);
    }
  };

  const handleCreateProfile = async () => {
    const name = newProfileName.trim();
    if (!name) {
      setProfileError('프로필 이름을 입력하세요.');
      return;
    }

    setIsProfileBusy(true);
    setProfileError('');

    try {
      if (!window.electronAPI?.createProfile) {
        setProfileError('프로필 생성 API를 찾을 수 없습니다. 앱을 완전히 종료 후 다시 실행하세요.');
        return;
      }

      const result = await window.electronAPI.createProfile({
        name,
        avatarColor: normalizeProfileColor(selectedProfileColor),
      });

      if (!result.success || !result.profile) {
        setProfileError(result.error || '프로필을 만들 수 없습니다.');
        return;
      }

      const nextProfiles = await refreshProfiles();
      setNewProfileName('');
      setSelectedProfileColor(PROFILE_COLORS[nextProfiles.length % PROFILE_COLORS.length] || PROFILE_COLORS[0]);
      setCustomProfileColor(PROFILE_COLORS[nextProfiles.length % PROFILE_COLORS.length] || PROFILE_COLORS[0]);
      setIsCreateProfileOpen(false);
      await handleSelectProfile(result.profile);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : '프로필 생성 중 오류가 발생했습니다.');
    } finally {
      setIsProfileBusy(false);
    }
  };

  const handleSaveProfile = async () => {
    const name = newProfileName.trim();
    if (!name) {
      setProfileError('프로필 이름을 입력하세요.');
      return;
    }

    setIsProfileBusy(true);
    setProfileError('');

    try {
      const avatarColor = normalizeProfileColor(selectedProfileColor);

      if (editingProfile) {
        if (!window.electronAPI?.updateProfile) {
          setProfileError('프로필 수정 API를 찾을 수 없습니다. 앱을 완전히 종료 후 다시 실행하세요.');
          return;
        }

        const result = await window.electronAPI.updateProfile(editingProfile.id, {
          name,
          avatarColor,
        });

        if (!result.success || !result.profile) {
          setProfileError(result.error || '프로필을 수정할 수 없습니다.');
          return;
        }

        await refreshProfiles();
        if (currentProfile?.id === editingProfile.id) {
          setCurrentProfile(result.profile);
        }
        setIsCreateProfileOpen(false);
        setEditingProfile(null);
        setNewProfileName('');
        setSelectedProfileColor(PROFILE_COLORS[0]);
        setCustomProfileColor(PROFILE_COLORS[0]);
        return;
      }

      if (!window.electronAPI?.createProfile) {
        setProfileError('프로필 생성 API를 찾을 수 없습니다. 앱을 완전히 종료 후 다시 실행하세요.');
        return;
      }

      const result = await window.electronAPI.createProfile({
        name,
        avatarColor,
      });

      if (!result.success || !result.profile) {
        setProfileError(result.error || '프로필을 만들 수 없습니다.');
        return;
      }

      const nextProfiles = await refreshProfiles();
      setNewProfileName('');
      setSelectedProfileColor(PROFILE_COLORS[nextProfiles.length % PROFILE_COLORS.length] || PROFILE_COLORS[0]);
      setCustomProfileColor(PROFILE_COLORS[nextProfiles.length % PROFILE_COLORS.length] || PROFILE_COLORS[0]);
      setIsCreateProfileOpen(false);
      await handleSelectProfile(result.profile);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : '프로필 저장 중 오류가 발생했습니다.');
    } finally {
      setIsProfileBusy(false);
    }
  };

  const openCreateProfileModal = () => {
    setEditingProfile(null);
    setProfileError('');
    setNewProfileName('');
    setSelectedProfileColor(PROFILE_COLORS[0]);
    setCustomProfileColor(PROFILE_COLORS[0]);
    setIsCreateProfileOpen(true);
  };

  const openEditProfileModal = (profile: Profile) => {
    const profileColor = normalizeProfileColor(profile.avatarColor || PROFILE_COLORS[0]);
    setEditingProfile(profile);
    setProfileError('');
    setNewProfileName(profile.name);
    setSelectedProfileColor(profileColor);
    setCustomProfileColor(profileColor);
    setIsCreateProfileOpen(true);
  };

  const handleDeleteProfile = async () => {
    if (!deleteTargetProfile) return;

    setIsProfileBusy(true);
    setProfileError('');

    try {
      const result = await window.electronAPI.deleteProfile(deleteTargetProfile.id);
      if (!result.success) {
        setProfileError(result.error || '프로필을 삭제할 수 없습니다.');
        return;
      }

      await refreshProfiles();
      if (editingProfile?.id === deleteTargetProfile.id) {
        setEditingProfile(null);
        setIsCreateProfileOpen(false);
      }
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : '프로필 삭제 중 오류가 발생했습니다.');
    } finally {
      setIsProfileBusy(false);
      setShowDeleteConfirm(false);
      setDeleteInput('');
      setDeleteTargetProfile(null);
    }
  };

  const handleSwitchProfile = async () => {
    await window.electronAPI.clearCurrentProfile();
    resetForProfile();
    setCurrentProfile(null);
    setIsAppSettingsOpen(false);
    setProfileError('');
    await refreshProfiles();
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="h-screen w-screen flex flex-col bg-discord-bg font-noto">
          <TitleBar onOpenSettings={() => currentProfile && !requiresPassword && setIsAppSettingsOpen(true)} />
          <div className="flex-1 min-h-0">
            {isCheckingPassword ? null : requiresPassword ? (
              <div className="h-full flex items-center justify-center bg-discord-bg p-6">
                <GateCard
                  title="앱 잠금 해제"
                  description="비밀번호를 입력한 뒤 프로필을 선택할 수 있습니다."
                  className="max-w-md"
                >
                  <div className="max-w-md space-y-3">
                    <Input
                      type="password"
                      value={passwordInput}
                      onChange={(e) => {
                        setPasswordInput(e.target.value);
                        setPasswordError('');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          void handleUnlock();
                        }
                      }}
                      className="bg-discord-bg border-gray-600 text-discord-text"
                      placeholder="비밀번호"
                      autoFocus
                    />
                    {passwordError && <p className="text-sm text-red-400">{passwordError}</p>}
                    <Button
                      onClick={() => void handleUnlock()}
                      className="w-full bg-discord-accent hover:bg-blue-600 text-white"
                      disabled={!passwordInput.trim()}
                    >
                      잠금 해제
                    </Button>
                  </div>
                </GateCard>
              </div>
            ) : !currentProfile ? (
              <div className="h-full flex items-center justify-center bg-discord-bg p-6">
                <GateCard
                  title="프로필 선택"
                  description="프로필마다 카테고리와 대시보드 통계가 분리됩니다."
                >
                  <div className="flex justify-center">
                    <div className="w-full max-w-4xl">
                      <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                        {profiles.map((profile) => (
                          <ContextMenu key={profile.id}>
                            <ContextMenuTrigger asChild>
                              <button
                                type="button"
                                disabled={isProfileBusy}
                                onClick={() => void handleSelectProfile(profile)}
                                className="group flex flex-col items-center text-center disabled:opacity-60"
                              >
                                <div
                                  className="flex aspect-square w-full max-w-[132px] items-center justify-center rounded-xl text-4xl font-semibold text-white transition duration-200 group-hover:scale-[1.03] group-hover:ring-2 group-hover:ring-white/70"
                                  style={getProfileSwatchStyle(profile.avatarColor)}
                                >
                                  {profile.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="mt-4 text-xl font-medium text-gray-300 transition group-hover:text-white">
                                  {profile.name}
                                </div>
                              </button>
                            </ContextMenuTrigger>
                            <ContextMenuContent>
                              <ContextMenuItem onClick={() => openEditProfileModal(profile)}>
                                프로필 수정
                              </ContextMenuItem>
                              <ContextMenuItem
                                className="text-red-400 focus:text-red-300"
                                onClick={() => {
                                  setDeleteTargetProfile(profile);
                                  setDeleteInput('');
                                  setProfileError('');
                                  setShowDeleteConfirm(true);
                                }}
                              >
                                프로필 삭제
                              </ContextMenuItem>
                            </ContextMenuContent>
                          </ContextMenu>
                        ))}

                        <button
                          type="button"
                          onClick={openCreateProfileModal}
                          className="group flex flex-col items-center text-center"
                        >
                          <div className="flex aspect-square w-full max-w-[132px] items-center justify-center rounded-full bg-gray-500/80 text-black transition duration-200 group-hover:scale-[1.03] group-hover:bg-gray-400">
                            <Plus className="h-16 w-16" strokeWidth={2.5} />
                          </div>
                          <div className="mt-4 text-xl font-medium text-gray-400 transition group-hover:text-white">
                            프로필 추가
                          </div>
                        </button>
                      </div>

                      {profileError && <p className="mt-8 text-center text-sm text-red-400">{profileError}</p>}
                    </div>
                  </div>
                </GateCard>
              </div>
            ) : (
              <>
                <HashRouter>
                  <RouterContent />
                </HashRouter>
                <Toaster />
                <Sonner />
              </>
            )}
          </div>
          <AppSettingsModal
            open={isAppSettingsOpen}
            onOpenChange={setIsAppSettingsOpen}
            currentProfileName={currentProfile?.name ?? ''}
            onRequestProfileSwitch={handleSwitchProfile}
          />
          <Dialog
            open={isCreateProfileOpen}
            onOpenChange={(open) => {
              setIsCreateProfileOpen(open);
              if (!open) {
                setProfileError('');
                setEditingProfile(null);
              }
            }}
          >
            <DialogContent className="max-w-md p-0 gap-0 overflow-hidden bg-discord-bg border-gray-700 text-discord-text [&>button]:hidden">
              <DialogTitle className="sr-only">{editingProfile ? '프로필 수정' : '새 프로필 만들기'}</DialogTitle>
              <div className="flex items-center justify-between p-6 border-b border-gray-700">
                <div>
                  <h3 className="text-lg font-semibold text-white">{editingProfile ? '프로필 수정' : '새 프로필 만들기'}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateProfileOpen(false)}
                  className="text-discord-muted hover:text-discord-text"
                  aria-label="새 프로필 만들기 닫기"
                >
                  <X size={24} />
                </button>
              </div>
              <div className="p-6 space-y-4 bg-discord-bg">
                <div
                  className="flex h-20 w-20 items-center justify-center rounded-xl text-3xl font-semibold text-white"
                  style={getProfileSwatchStyle(selectedProfileColor)}
                >
                  {selectedProfileInitial}
                </div>
                <Input
                  value={newProfileName}
                  onChange={(e) => {
                    setNewProfileName(e.target.value);
                    setProfileError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      void handleSaveProfile();
                    }
                  }}
                  className="bg-discord-sidebar border-gray-600 text-discord-text"
                  placeholder="프로필 이름"
                />
                <div className="flex flex-wrap gap-2">
                  {PROFILE_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => {
                        setSelectedProfileColor(color);
                        setCustomProfileColor(color);
                      }}
                      className={`flex h-10 w-10 items-center justify-center rounded-full border-2 p-0 transition ${
                        selectedProfileColor === color ? 'border-white scale-105' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: 'transparent' }}
                      aria-label={`프로필 색상 ${color}`}
                    >
                      <span
                        className="block h-full w-full rounded-full"
                        style={{ backgroundColor: color }}
                      />
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => customColorInputRef.current?.click()}
                    className={`flex h-10 w-10 items-center justify-center rounded-full border-2 p-0 transition ${
                      isCustomColorSelected ? 'border-white scale-105' : 'border-transparent'
                    }`}
                    aria-label="프로필 색상 무지개"
                  >
                    <span
                      className="block h-full w-full rounded-full"
                      style={getProfileSwatchStyle(RAINBOW_PROFILE_COLOR)}
                    />
                  </button>
                </div>
                <input
                  ref={customColorInputRef}
                  type="color"
                  value={normalizeProfileColor(customProfileColor)}
                  onChange={(e) => {
                    const nextColor = normalizeProfileColor(e.target.value);
                    setCustomProfileColor(nextColor);
                    setSelectedProfileColor(nextColor);
                  }}
                  className="sr-only"
                  aria-label="직접 색상 선택"
                />
                {profileError && <p className="text-sm text-red-400">{profileError}</p>}
              </div>
              <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-700 bg-discord-bg">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsCreateProfileOpen(false)}
                  className="text-discord-text hover:bg-discord-hover"
                >
                  취소
                </Button>
                <Button
                  onClick={() => void handleSaveProfile()}
                  className="bg-discord-accent hover:bg-blue-600 text-white"
                  disabled={isProfileBusy || !newProfileName.trim()}
                >
                  {editingProfile ? '프로필 수정' : '프로필 생성'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          {showDeleteConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
              <div className="bg-discord-bg rounded-lg p-6 w-full max-w-md border border-gray-700 flex flex-col items-center">
                <div className="mb-6 text-center text-discord-text">
                  <div className="text-base font-medium mb-2">
                    {deleteTargetProfile
                      ? `정말로 ${deleteTargetProfile.name} 프로필을 삭제하시겠습니까?`
                      : '정말로 이 프로필을 삭제하시겠습니까?'}
                  </div>
                  <div className="text-red-400 font-semibold mb-2">
                    이 작업은 되돌릴 수 없습니다.
                  </div>
                  <div className="text-discord-muted text-sm">
                    아래에 <span className="font-semibold">프로필을 삭제하겠습니다</span>를 입력하세요
                  </div>
                </div>

                {isProfileBusy && (
                  <div className="mb-4 p-4 bg-discord-sidebar rounded-lg border border-gray-600">
                    <div className="flex items-center justify-center gap-3">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-discord-accent"></div>
                      <div className="text-discord-text text-sm">
                        프로필 삭제 중...
                        <div className="text-discord-muted text-xs mt-1">
                          프로필 데이터와 카테고리를 정리 중
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <Input
                  type="text"
                  value={deleteInput}
                  onChange={(e) => setDeleteInput(e.target.value)}
                  className="w-full mb-3 bg-discord-sidebar border-gray-600 text-discord-text"
                  placeholder="프로필을 삭제하겠습니다"
                  disabled={isProfileBusy}
                />
                <div className="flex w-full gap-2">
                  <Button
                    variant="ghost"
                    className="flex-1 text-discord-text hover:bg-discord-hover"
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      setDeleteInput('');
                      setDeleteTargetProfile(null);
                    }}
                    disabled={isProfileBusy}
                  >
                    취소
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1 bg-discord-danger hover:bg-red-900 text-white disabled:bg-red-800 disabled:text-red-300 disabled:cursor-not-allowed"
                    disabled={deleteInput !== '프로필을 삭제하겠습니다' || isProfileBusy}
                    onClick={() => {
                      void handleDeleteProfile();
                    }}
                  >
                    {isProfileBusy ? '삭제 중...' : '삭제'}
                  </Button>
                </div>
              </div>
            </div>
          )}
          <LoadingOverlay />
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
