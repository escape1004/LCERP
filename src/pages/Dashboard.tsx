import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, Archive, Calendar, FileText, Folder, Image, Link2Off, Video } from 'lucide-react';
import { Sidebar } from '../components/Sidebar';
import { useERPStore } from '../hooks/useERPStore';
import { Category, DashboardWarningItem, DataRecord } from '../types';
import { isSeparatorCategory } from '../lib/category';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { RecordModal } from '../components/RecordModal';
import { ViewRecordModal } from '../components/ViewRecordModal';
import { DatabaseViewer } from '../components/DatabaseViewer';
import { Button } from '../components/ui/button';
import { CategoryModal } from '../components/CategoryModal';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '../components/ui/context-menu';

interface CategoryStats {
  category: Category;
  recordCount: number;
  imageCount: number;
  videoCount: number;
  archiveCount: number;
  recentRecords: DataRecord[];
}

const formatNumber = (num: number): string => num.toLocaleString('ko-KR');

const CustomTooltip = ({ active, payload, label, labelFormatter }: any) => {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const data = payload[0].payload;
  const value = payload[0].value;
  const displayLabel = labelFormatter ? labelFormatter(label, payload) : (data?.fullName || data?.name || label);

  return (
    <div
      style={{
        backgroundColor: '#2F3136',
        border: '1px solid #40444B',
        borderRadius: '4px',
        padding: '8px 12px',
        color: '#FFFFFF',
      }}
    >
      {displayLabel && (
        <div style={{ marginBottom: '4px', color: '#FFFFFF', fontWeight: 500 }}>
          {displayLabel}
        </div>
      )}
      <div style={{ color: '#FFFFFF' }}>개수: {formatNumber(value)}</div>
    </div>
  );
};

const StatCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode; color?: string }> = ({
  title,
  value,
  icon,
  color = 'bg-discord-accent',
}) => (
  <div className="bg-discord-sidebar rounded-lg p-4 border border-gray-700">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-discord-muted mb-1">{title}</p>
        <p className="text-2xl font-bold text-discord-text">{typeof value === 'number' ? formatNumber(value) : value}</p>
      </div>
      <div className={`${color} p-3 rounded-lg`}>
        {icon}
      </div>
    </div>
  </div>
);

export default function Dashboard() {
  const navigate = useNavigate();
  const { categories, loadCategories, loadRecords, getCategoryRecords, selectCategory, showDbViewer, currentProfile, setPendingRecordFocus, setShowDbViewer } = useERPStore();
  const [loading, setLoading] = useState(true);
  const [categoryStats, setCategoryStats] = useState<CategoryStats[]>([]);
  const [dateUnit, setDateUnit] = useState<'day' | 'month' | 'year'>('day');
  const [viewRecordModalOpen, setViewRecordModalOpen] = useState(false);
  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<DataRecord | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [warningItems, setWarningItems] = useState<DashboardWarningItem[]>([]);
  const [warningTotalCount, setWarningTotalCount] = useState(0);
  const [warningCounts, setWarningCounts] = useState({ missingFiles: 0, brokenRelations: 0 });

  useEffect(() => {
    const loadAllData = async () => {
      setLoading(true);
      try {
        await loadCategories();

        const store = useERPStore.getState();
        const loadedCategories = store.categories;
        const allCategories = loadedCategories
          .filter((cat) => !isSeparatorCategory(cat))
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const rootCategories = loadedCategories
          .filter((cat) => !cat.parentId && !isSeparatorCategory(cat))
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

        if (rootCategories.length === 0) {
          setCategoryStats([]);
          setWarningItems([]);
          setWarningTotalCount(0);
          setWarningCounts({ missingFiles: 0, brokenRelations: 0 });
          return;
        }

        await Promise.all(allCategories.map((category) => loadRecords(category.id)));
        const warningResult = await window.electronAPI.getDashboardWarnings(8);

        const stats: CategoryStats[] = rootCategories.map((category) => {
          const records = getCategoryRecords(category.id) || [];
          const fileField = category.fields.find((field) => field.type === 'file');

          let imageCount = 0;
          let videoCount = 0;
          let archiveCount = 0;

          records.forEach((record) => {
            if (!fileField || !record.data[fileField.id]) {
              return;
            }

            const filePath = String(record.data[fileField.id] || '');
            const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();

            if (/\.(jpg|jpeg|png|gif|webp)$/i.test(ext)) {
              imageCount += 1;
            } else if (/\.(mp4|avi|mkv|mov|wmv|flv|webm)$/i.test(ext)) {
              videoCount += 1;
            } else if (/\.(zip|7z|rar)$/i.test(ext)) {
              archiveCount += 1;
            }
          });

          const recentRecords = [...records]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 5);

          return {
            category,
            recordCount: records.length,
            imageCount,
            videoCount,
            archiveCount,
            recentRecords,
          };
        });

        setCategoryStats(stats);
        setWarningItems(warningResult.items);
        setWarningTotalCount(warningResult.totalCount);
        setWarningCounts(warningResult.counts);
      } finally {
        setLoading(false);
      }
    };

    void loadAllData();
  }, [loadCategories, loadRecords, getCategoryRecords, currentProfile?.id]);

  const getWarningRecordContext = (item: DashboardWarningItem) => {
    const category = categories.find((candidate) => candidate.id === item.categoryId) || null;
    const record = getCategoryRecords(item.categoryId).find((candidate) => candidate.id === item.recordId) || null;
    return { category, record };
  };

  const openWarningRecordView = (item: DashboardWarningItem) => {
    const { category, record } = getWarningRecordContext(item);
    if (!category || !record) return;
    setSelectedCategory(category);
    setSelectedRecord(record);
    setViewRecordModalOpen(true);
  };

  const openWarningRecordEdit = (item: DashboardWarningItem) => {
    const { category, record } = getWarningRecordContext(item);
    if (!category || !record) return;
    setSelectedCategory(category);
    setSelectedRecord(record);
    setRecordModalOpen(true);
  };

  const moveToWarningRecord = async (item: DashboardWarningItem) => {
    await loadCategories();
    setPendingRecordFocus({ categoryId: item.categoryId, recordId: item.recordId });
    setShowDbViewer(false);
    void selectCategory(item.categoryId);
    navigate('/category', {
      state: {
        categoryId: item.categoryId,
        recordId: item.recordId,
      },
    });
  };

  const totalStats = useMemo(() => {
    const rootCategories = categories.filter((cat) => !cat.parentId && !isSeparatorCategory(cat));
    return {
      totalCategories: rootCategories.length,
      totalRecords: categoryStats.reduce((sum, stat) => sum + stat.recordCount, 0),
      totalImages: categoryStats.reduce((sum, stat) => sum + stat.imageCount, 0),
      totalVideos: categoryStats.reduce((sum, stat) => sum + stat.videoCount, 0),
      totalArchives: categoryStats.reduce((sum, stat) => sum + stat.archiveCount, 0),
    };
  }, [categories, categoryStats]);

  const summaryCards = useMemo(() => {
    const cards = [
      {
        key: 'categories',
        title: '전체 카테고리',
        value: totalStats.totalCategories,
        icon: <Folder size={24} className="text-white" />,
        color: 'bg-blue-500',
      },
      {
        key: 'records',
        title: '전체 항목',
        value: totalStats.totalRecords,
        icon: <FileText size={24} className="text-white" />,
        color: 'bg-green-500',
      },
    ];

    if (totalStats.totalImages > 0) {
      cards.push({
        key: 'images',
        title: '이미지',
        value: totalStats.totalImages,
        icon: <Image size={24} className="text-white" />,
        color: 'bg-purple-500',
      });
    }

    if (totalStats.totalVideos > 0) {
      cards.push({
        key: 'videos',
        title: '동영상',
        value: totalStats.totalVideos,
        icon: <Video size={24} className="text-white" />,
        color: 'bg-red-500',
      });
    }

    if (totalStats.totalArchives > 0) {
      cards.push({
        key: 'archives',
        title: '압축파일',
        value: totalStats.totalArchives,
        icon: <Archive size={24} className="text-white" />,
        color: 'bg-yellow-500',
      });
    }

    return cards;
  }, [totalStats]);

  const categoryRecordData = useMemo(() => {
    return categoryStats
      .filter((stat) => stat.recordCount > 0)
      .sort((a, b) => b.recordCount - a.recordCount)
      .slice(0, 10)
      .map((stat) => ({
        name: stat.category.name,
        fullName: stat.category.name,
        records: stat.recordCount,
        categoryId: stat.category.id,
      }));
  }, [categoryStats]);

  const fileTypeData = useMemo(() => {
    return [
      { name: '이미지', value: totalStats.totalImages, color: '#A855F7' },
      { name: '동영상', value: totalStats.totalVideos, color: '#EF4444' },
      { name: '압축파일', value: totalStats.totalArchives, color: '#EAB308' },
    ].filter((item) => item.value > 0);
  }, [totalStats]);

  const hasAnyRecords = categoryStats.some((stat) => stat.recordCount > 0);
  const hasAnyAttachments = fileTypeData.length > 0;

  const dateTrendData = useMemo(() => {
    const dateMap = new Map<string, number>();
    const today = new Date();

    if (dateUnit === 'day') {
      for (let i = 29; i >= 0; i -= 1) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        dateMap.set(dateStr, 0);
      }

      categoryStats.forEach((stat) => {
        const records = getCategoryRecords(stat.category.id) || [];
        records.forEach((record) => {
          const dateStr = record.createdAt.split('T')[0];
          if (dateMap.has(dateStr)) {
            dateMap.set(dateStr, (dateMap.get(dateStr) || 0) + 1);
          }
        });
      });

      return Array.from(dateMap.entries()).map(([date, count]) => ({
        date: new Date(date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
        count,
      }));
    }

    if (dateUnit === 'month') {
      for (let i = 11; i >= 0; i -= 1) {
        const date = new Date(today);
        date.setMonth(date.getMonth() - i);
        const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        dateMap.set(monthStr, 0);
      }

      categoryStats.forEach((stat) => {
        const records = getCategoryRecords(stat.category.id) || [];
        records.forEach((record) => {
          const recordDate = new Date(record.createdAt);
          const monthStr = `${recordDate.getFullYear()}-${String(recordDate.getMonth() + 1).padStart(2, '0')}`;
          if (dateMap.has(monthStr)) {
            dateMap.set(monthStr, (dateMap.get(monthStr) || 0) + 1);
          }
        });
      });

      return Array.from(dateMap.entries()).map(([date, count]) => ({
        date: new Date(`${date}-01`).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short' }),
        count,
      }));
    }

    for (let i = 9; i >= 0; i -= 1) {
      const date = new Date(today);
      date.setFullYear(date.getFullYear() - i);
      const yearStr = String(date.getFullYear());
      dateMap.set(yearStr, 0);
    }

    categoryStats.forEach((stat) => {
      const records = getCategoryRecords(stat.category.id) || [];
      records.forEach((record) => {
        const yearStr = String(new Date(record.createdAt).getFullYear());
        if (dateMap.has(yearStr)) {
          dateMap.set(yearStr, (dateMap.get(yearStr) || 0) + 1);
        }
      });
    });

    return Array.from(dateMap.entries()).map(([date, count]) => ({
      date: `${date}년`,
      count,
    }));
  }, [categoryStats, getCategoryRecords, dateUnit]);

  const hasTrendData = dateTrendData.some((entry) => entry.count > 0);

  const populatedCategoryStats = useMemo(() => {
    return categoryStats
      .filter((stat) => stat.recordCount > 0)
      .sort((a, b) => (a.category.order ?? 0) - (b.category.order ?? 0));
  }, [categoryStats]);

  if (loading) {
    return (
      <div className="flex h-full overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center bg-discord-bg">
          <div className="text-discord-muted">로딩 중...</div>
        </div>
      </div>
    );
  }

  const rootCategories = categories.filter((cat) => !cat.parentId && !isSeparatorCategory(cat));
  if (rootCategories.length === 0) {
    return (
      <div className="flex h-full overflow-hidden">
        <Sidebar />
        <div className="flex-1 overflow-y-auto bg-discord-bg discord-scrollbar">
          <div className="p-6">
            <h1 className="text-2xl font-bold text-discord-text mb-6">대시보드</h1>
            <div className="bg-discord-sidebar rounded-lg p-8 border border-gray-700 text-center flex flex-col items-center">
              <div className="order-last mt-6 flex justify-center">
                <Button
                  onClick={() => setIsCategoryModalOpen(true)}
                  className="bg-discord-accent hover:bg-blue-600 text-white"
                >
                  카테고리 생성
                </Button>
              </div>
              <p className="text-discord-muted text-lg mb-2">카테고리가 없습니다</p>
              <p className="text-discord-muted text-sm">첫 카테고리를 생성해서 대시보드를 시작하세요.</p>
            </div>
          </div>
        </div>
        <CategoryModal isOpen={isCategoryModalOpen} onClose={() => setIsCategoryModalOpen(false)} />
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar />
      {showDbViewer ? (
        <div className="flex-1 flex flex-col min-h-0">
          <DatabaseViewer />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto bg-discord-bg discord-scrollbar">
          <div className="p-6">
            <h1 className="text-2xl font-bold text-discord-text mb-6">대시보드</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              {summaryCards.map((card) => (
                <StatCard key={card.key} title={card.title} value={card.value} icon={card.icon} color={card.color} />
              ))}
            </div>

            {warningTotalCount > 0 && (
            <div className="bg-discord-sidebar rounded-lg p-6 border border-gray-700 mb-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/15 text-amber-300">
                    <AlertTriangle size={18} />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-discord-text">주의 항목</h2>
                    <p className="text-sm text-discord-muted">{`확인이 필요한 항목 ${formatNumber(warningTotalCount)}개`}</p>
                  </div>
                </div>
                <div className="flex gap-2 text-xs text-discord-muted">
                  {warningCounts.missingFiles > 0 && <span>파일 누락 {formatNumber(warningCounts.missingFiles)}</span>}
                  {warningCounts.brokenRelations > 0 && <span>참조 깨짐 {formatNumber(warningCounts.brokenRelations)}</span>}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {warningItems.map((item) => (
                  <ContextMenu key={item.id}>
                    <ContextMenuTrigger asChild>
                      <button
                        type="button"
                        className="text-left bg-discord-bg rounded-lg border border-gray-700 px-4 py-3 hover:border-discord-accent hover:bg-discord-hover transition-colors"
                        onClick={() => openWarningRecordView(item)}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {item.type === 'missing-file' ? (
                            <AlertTriangle size={14} className="text-amber-300" />
                          ) : (
                            <Link2Off size={14} className="text-rose-300" />
                          )}
                          <span className="text-sm font-medium text-discord-text">{item.title}</span>
                        </div>
                        <p className="text-sm text-discord-muted">{item.description}</p>
                      </button>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem onClick={() => openWarningRecordEdit(item)}>
                        수정하기
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => void moveToWarningRecord(item)}>
                        해당 위치로 이동
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                ))}
              </div>
              {warningTotalCount > warningItems.length && (
                <p className="mt-4 text-xs text-discord-muted">
                  상위 {formatNumber(warningItems.length)}개만 표시 중입니다. 전체 경고는 {formatNumber(warningTotalCount)}개입니다.
                </p>
              )}
            </div>
            )}

            {(categoryRecordData.length > 0 || hasAnyAttachments) && (
              <div className={`grid grid-cols-1 gap-6 mb-6 ${categoryRecordData.length > 0 && hasAnyAttachments ? 'lg:grid-cols-2' : ''}`}>
                {categoryRecordData.length > 0 && (
                  <div className="bg-discord-sidebar rounded-lg p-6 border border-gray-700">
                    <h2 className="text-lg font-semibold text-discord-text mb-4">카테고리별 항목 수 (상위 10개)</h2>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart
                        data={categoryRecordData}
                        onClick={(data: any) => {
                          if (data?.activePayload?.length) {
                            const clickedData = data.activePayload[0].payload;
                            if (clickedData?.categoryId) {
                              selectCategory(clickedData.categoryId);
                              navigate('/category');
                            }
                          } else if (data?.activeLabel) {
                            const clickedData = categoryRecordData.find((item) => item.name === data.activeLabel);
                            if (clickedData?.categoryId) {
                              selectCategory(clickedData.categoryId);
                              navigate('/category');
                            }
                          }
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis
                          dataKey="name"
                          stroke="#9CA3AF"
                          fontSize={12}
                          interval={0}
                          tick={(props: any) => {
                            const { x, y, payload } = props;
                            const text = payload.value || '';
                            const maxLength = 8;
                            const displayText = text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;

                            return (
                              <g transform={`translate(${x},${y})`}>
                                <text x={0} y={0} dy={16} textAnchor="middle" fill="#9CA3AF" fontSize={12}>
                                  {displayText}
                                </text>
                              </g>
                            );
                          }}
                        />
                        <YAxis stroke="#9CA3AF" fontSize={12} />
                        <Tooltip
                          content={<CustomTooltip />}
                          labelFormatter={(label: any, payload: any) => {
                            if (payload?.length) {
                              const data = payload[0].payload;
                              return data?.fullName || data?.name || label;
                            }
                            return label;
                          }}
                        />
                        <Bar dataKey="records" fill="#5865F2" style={{ cursor: 'pointer' }} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {hasAnyAttachments && (
                  <div className="bg-discord-sidebar rounded-lg p-6 border border-gray-700">
                    <h2 className="text-lg font-semibold text-discord-text mb-4">첨부파일 유형 분포</h2>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={fileTypeData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {fileTypeData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          content={<CustomTooltip />}
                          labelFormatter={(label: any, payload: any) => (payload?.length ? payload[0].name || label || '' : label || '')}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}

            {hasAnyRecords && hasTrendData && (
              <div className="bg-discord-sidebar rounded-lg p-6 border border-gray-700 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-discord-text">최근 항목 추가 추이</h2>
                  <Select value={dateUnit} onValueChange={(value: 'day' | 'month' | 'year') => setDateUnit(value)}>
                    <SelectTrigger className="w-32 bg-discord-bg border-gray-600 text-discord-text">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-discord-sidebar border-gray-600">
                      <SelectItem value="day" className="text-discord-text focus:bg-discord-hover">일별</SelectItem>
                      <SelectItem value="month" className="text-discord-text focus:bg-discord-hover">월별</SelectItem>
                      <SelectItem value="year" className="text-discord-text focus:bg-discord-hover">연도별</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={dateTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="date" stroke="#9CA3AF" fontSize={12} />
                    <YAxis stroke="#9CA3AF" fontSize={12} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="count" stroke="#5865F2" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {populatedCategoryStats.length > 0 && (
              <div className="bg-discord-sidebar rounded-lg p-6 border border-gray-700">
                <h2 className="text-lg font-semibold text-discord-text mb-4">카테고리별 상세 통계</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {populatedCategoryStats.map((stat) => {
                    const displayField = stat.category.fields.find((field) => field.type === 'text') || stat.category.fields[0];
                    const attachmentItems = [
                      stat.imageCount > 0
                        ? { key: 'image', icon: <Image size={16} className="text-purple-400" />, label: `이미지: ${formatNumber(stat.imageCount)}` }
                        : null,
                      stat.videoCount > 0
                        ? { key: 'video', icon: <Video size={16} className="text-red-400" />, label: `동영상: ${formatNumber(stat.videoCount)}` }
                        : null,
                      stat.archiveCount > 0
                        ? { key: 'archive', icon: <Archive size={16} className="text-yellow-400" />, label: `압축파일: ${formatNumber(stat.archiveCount)}` }
                        : null,
                    ].filter(Boolean) as Array<{ key: string; icon: React.ReactNode; label: string }>;

                    return (
                      <div key={stat.category.id} className="bg-discord-bg rounded-lg p-4 border border-gray-700">
                        <div className="flex items-center justify-between mb-3">
                          <h3
                            className="text-md font-semibold text-discord-text cursor-pointer hover:text-discord-accent transition-colors"
                            onClick={() => {
                              selectCategory(stat.category.id);
                              navigate('/category');
                            }}
                          >
                            {stat.category.name}
                          </h3>
                          <span className="text-sm text-discord-muted">총 {formatNumber(stat.recordCount)}개 항목</span>
                        </div>

                        {attachmentItems.length > 0 && (
                          <div className={`grid gap-4 mb-3 ${attachmentItems.length === 1 ? 'grid-cols-1' : attachmentItems.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                            {attachmentItems.map((item) => (
                              <div key={item.key} className="flex items-center gap-2">
                                {item.icon}
                                <span className="text-sm text-white">{item.label}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {stat.recentRecords.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-700">
                            <p className="text-xs text-discord-muted mb-2">최근 추가된 항목:</p>
                            <div className="space-y-1">
                              {stat.recentRecords.map((record) => {
                                const displayValue = displayField && record.data[displayField.id]
                                  ? String(record.data[displayField.id])
                                  : new Date(record.createdAt).toLocaleDateString('ko-KR');
                                const dateStr = new Date(record.createdAt).toLocaleDateString('ko-KR');

                                return (
                                  <div key={record.id} className="text-xs text-discord-text flex items-center gap-2">
                                    <Calendar size={12} className="text-discord-muted" />
                                    <span
                                      className="cursor-pointer hover:text-discord-accent transition-colors"
                                      onClick={() => {
                                        setSelectedRecord(record);
                                        setSelectedCategory(stat.category);
                                        setViewRecordModalOpen(true);
                                      }}
                                    >
                                      {displayValue}
                                      <span className="text-gray-500 text-[10px] ml-1">({dateStr})</span>
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <ViewRecordModal
        isOpen={viewRecordModalOpen}
        onClose={() => {
          setViewRecordModalOpen(false);
          window.setTimeout(() => {
            setSelectedRecord(null);
            setSelectedCategory(null);
          }, 200);
        }}
        category={selectedCategory}
        record={selectedRecord}
      />
      {selectedCategory && (
        <RecordModal
          isOpen={recordModalOpen}
          onClose={() => {
            setRecordModalOpen(false);
            window.setTimeout(() => {
              setSelectedRecord(null);
              setSelectedCategory(null);
            }, 200);
          }}
          category={selectedCategory}
          record={selectedRecord}
        />
      )}
      <CategoryModal isOpen={isCategoryModalOpen} onClose={() => setIsCategoryModalOpen(false)} />
    </div>
  );
}
