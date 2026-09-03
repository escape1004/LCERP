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
import {
  AlertTriangle,
  Archive,
  Calendar,
  FileText,
  Folder,
  Image,
  Link2Off,
  TimerReset,
  Video,
} from 'lucide-react';
import { Sidebar } from '../components/Sidebar';
import { useERPStore } from '../hooks/useERPStore';
import { Category, DashboardWarningItem, DataRecord } from '../types';
import { isSeparatorCategory } from '../lib/category';
import { resolveFilePath } from '../lib/pathResolver';
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

interface RankedRecord {
  record: DataRecord;
  category: Category;
  referenceCount: number;
  displayValue: string;
}

interface ChildCategoryDashboardSection {
  category: Category;
  recordRanking: RankedRecord[];
  recentRecords: Array<{
    record: DataRecord;
    category: Category;
  }>;
}

const ALL_ROOT_CATEGORIES_VALUE = '__all__';
const SUPPORTED_THUMBNAIL_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.avi', '.mkv', '.mov', '.zip', '.7z'];

const formatNumber = (num: number): string => num.toLocaleString('ko-KR');

const getFileTypeCounts = (category: Category, records: DataRecord[]) => {
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

  return { imageCount, videoCount, archiveCount };
};

const getCategoryDisplayField = (category: Category) => category.fields.find((field) => field.type === 'text') || category.fields[0];

const getRecordDisplayValue = (category: Category, record: DataRecord) => {
  const displayField = getCategoryDisplayField(category);
  return displayField && record.data[displayField.id]
    ? String(record.data[displayField.id])
    : new Date(record.createdAt).toLocaleDateString('ko-KR');
};

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

const RecordThumbnail: React.FC<{ category: Category; record: DataRecord }> = ({ category, record }) => {
  const fileField = useMemo(
    () => category.fields.find((field) => field.type === 'file') || null,
    [category]
  );
  const filePath = useMemo(
    () => (fileField ? resolveFilePath(record.data[fileField.id], fileField) : null),
    [fileField, record]
  );
  const fileExt = useMemo(
    () => (filePath ? filePath.slice(filePath.lastIndexOf('.')).toLowerCase() : ''),
    [filePath]
  );
  const isArchiveFile = fileExt === '.zip' || fileExt === '.7z';
  const isSupportedThumbnail = !!filePath && SUPPORTED_THUMBNAIL_EXTS.includes(fileExt);
  const [thumbnailDataUrl, setThumbnailDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let ignore = false;

    if (!isSupportedThumbnail || !filePath) {
      setThumbnailDataUrl(null);
      setLoading(false);
      return () => {
        ignore = true;
      };
    }

    setLoading(true);
    window.electronAPI.getThumbnailDataUrlHybrid(record, filePath)
      .then((result) => {
        if (!ignore) {
          setThumbnailDataUrl(result || null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!ignore) {
          setThumbnailDataUrl(null);
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [filePath, isSupportedThumbnail, record]);

  if (!fileField) {
    return null;
  }

  return (
    <div className="w-14 h-14 shrink-0 rounded border border-gray-700 bg-black/40 flex items-center justify-center overflow-hidden">
      {loading ? (
        <span className="text-[10px] text-discord-muted">로딩</span>
      ) : thumbnailDataUrl ? (
        <img src={thumbnailDataUrl} alt="썸네일" className="w-full h-full object-cover" />
      ) : filePath ? (
        <div className="w-full h-full bg-gray-800 flex items-center justify-center text-gray-500">
          {isArchiveFile ? (
            <Archive size={18} className="text-yellow-400/80" />
          ) : (
            <span className="text-lg">🖼️</span>
          )}
        </div>
      ) : (
        <div className="w-full h-full bg-gray-900 flex items-center justify-center text-gray-600">
          <span className="text-lg">-</span>
        </div>
      )}
    </div>
  );
};

export default function Dashboard() {
  const navigate = useNavigate();
  const {
    categories,
    loadCategories,
    loadRecords,
    getCategoryRecords,
    selectCategory,
    showDbViewer,
    currentProfile,
    setPendingRecordFocus,
    setShowDbViewer,
    getRecordReferenceCount,
  } = useERPStore();
  const [loading, setLoading] = useState(true);
  const [categoryStats, setCategoryStats] = useState<CategoryStats[]>([]);
  const [dateUnit, setDateUnit] = useState<'day' | 'month' | 'year'>('day');
  const [viewRecordModalOpen, setViewRecordModalOpen] = useState(false);
  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<DataRecord | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedRootCategoryId, setSelectedRootCategoryId] = useState<string>(ALL_ROOT_CATEGORIES_VALUE);
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
        const rootCategories = allCategories.filter((cat) => !cat.parentId);

        if (rootCategories.length === 0) {
          setCategoryStats([]);
          setWarningItems([]);
          setWarningTotalCount(0);
          setWarningCounts({ missingFiles: 0, brokenRelations: 0 });
          return;
        }

        await Promise.all(allCategories.map((category) => loadRecords(category.id)));
        const warningResult = await window.electronAPI.getDashboardWarnings(8);

        const stats: CategoryStats[] = allCategories.map((category) => {
          const records = store.getCategoryRecords(category.id) || [];
          const { imageCount, videoCount, archiveCount } = getFileTypeCounts(category, records);
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
  }, [loadCategories, loadRecords, currentProfile?.id]);

  const visibleCategories = useMemo(
    () => categories.filter((cat) => !isSeparatorCategory(cat)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [categories]
  );

  const rootCategories = useMemo(
    () => visibleCategories.filter((cat) => !cat.parentId),
    [visibleCategories]
  );

  useEffect(() => {
    if (selectedRootCategoryId === ALL_ROOT_CATEGORIES_VALUE) {
      return;
    }

    if (!rootCategories.some((category) => category.id === selectedRootCategoryId)) {
      setSelectedRootCategoryId(ALL_ROOT_CATEGORIES_VALUE);
    }
  }, [rootCategories, selectedRootCategoryId]);

  const selectedRootCategory = useMemo(
    () => rootCategories.find((category) => category.id === selectedRootCategoryId) || null,
    [rootCategories, selectedRootCategoryId]
  );

  const categoryMap = useMemo(
    () => new Map(visibleCategories.map((category) => [category.id, category])),
    [visibleCategories]
  );

  const childrenByParentId = useMemo(() => {
    const map = new Map<string, Category[]>();
    visibleCategories.forEach((category) => {
      if (!category.parentId) {
        return;
      }

      const siblings = map.get(category.parentId) || [];
      siblings.push(category);
      map.set(category.parentId, siblings);
    });

    map.forEach((items) => items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
    return map;
  }, [visibleCategories]);

  const selectedCategoryIds = useMemo(() => {
    if (!selectedRootCategory) {
      return new Set(visibleCategories.map((category) => category.id));
    }

    const ids = new Set<string>();
    const stack = [selectedRootCategory.id];

    while (stack.length > 0) {
      const currentId = stack.pop();
      if (!currentId || ids.has(currentId)) {
        continue;
      }

      ids.add(currentId);
      const children = childrenByParentId.get(currentId) || [];
      children.forEach((child) => stack.push(child.id));
    }

    return ids;
  }, [childrenByParentId, selectedRootCategory, visibleCategories]);

  const scopedCategoryStats = useMemo(
    () => categoryStats.filter((stat) => selectedCategoryIds.has(stat.category.id)),
    [categoryStats, selectedCategoryIds]
  );

  const childCategoryStats = useMemo(
    () => scopedCategoryStats.filter((stat) => stat.category.parentId === selectedRootCategory?.id),
    [scopedCategoryStats, selectedRootCategory?.id]
  );

  const descendantCategoryStats = useMemo(
    () => scopedCategoryStats.filter((stat) => stat.category.id !== selectedRootCategory?.id),
    [scopedCategoryStats, selectedRootCategory?.id]
  );

  const filteredWarnings = useMemo(
    () => warningItems.filter((item) => selectedCategoryIds.has(item.categoryId)),
    [selectedCategoryIds, warningItems]
  );

  const filteredWarningCounts = useMemo(() => {
    return filteredWarnings.reduce(
      (acc, item) => {
        if (item.type === 'missing-file') {
          acc.missingFiles += 1;
        } else if (item.type === 'broken-relation') {
          acc.brokenRelations += 1;
        }
        return acc;
      },
      { missingFiles: 0, brokenRelations: 0 }
    );
  }, [filteredWarnings]);

  const selectedWarningTotalCount = selectedRootCategory ? filteredWarnings.length : warningTotalCount;
  const selectedWarningCounts = selectedRootCategory ? filteredWarningCounts : warningCounts;

  const totalStats = useMemo(() => {
    return {
      totalCategories: rootCategories.length,
      totalRecords: scopedCategoryStats.reduce((sum, stat) => sum + stat.recordCount, 0),
      totalImages: scopedCategoryStats.reduce((sum, stat) => sum + stat.imageCount, 0),
      totalVideos: scopedCategoryStats.reduce((sum, stat) => sum + stat.videoCount, 0),
      totalArchives: scopedCategoryStats.reduce((sum, stat) => sum + stat.archiveCount, 0),
      totalChildCategories: descendantCategoryStats.length,
    };
  }, [descendantCategoryStats.length, rootCategories.length, scopedCategoryStats]);

  const summaryCards = useMemo(() => {
    const cards: Array<{
      key: string;
      title: string;
      value: number;
      icon: React.ReactNode;
      color: string;
    }> = [];

    if (!selectedRootCategory) {
      cards.push({
        key: 'categories',
        title: '전체 카테고리',
        value: totalStats.totalCategories,
        icon: <Folder size={24} className="text-white" />,
        color: 'bg-blue-500',
      });
    } else {
      cards.push({
        key: 'childCategories',
        title: '하위 카테고리',
        value: totalStats.totalChildCategories,
        icon: <Folder size={24} className="text-white" />,
        color: 'bg-blue-500',
      });
    }

    cards.push({
      key: 'records',
      title: selectedRootCategory ? '카테고리 전체 항목' : '전체 항목',
      value: totalStats.totalRecords,
      icon: <FileText size={24} className="text-white" />,
      color: 'bg-green-500',
    });

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
  }, [selectedRootCategory, totalStats]);

  const categoryRecordData = useMemo(() => {
    return scopedCategoryStats
      .filter((stat) => stat.recordCount > 0)
      .sort((a, b) => b.recordCount - a.recordCount)
      .slice(0, 10)
      .map((stat) => ({
        name: stat.category.name,
        fullName: stat.category.name,
        records: stat.recordCount,
        categoryId: stat.category.id,
      }));
  }, [scopedCategoryStats]);

  const childCategoryRecordData = useMemo(() => {
    return descendantCategoryStats
      .filter((stat) => stat.recordCount > 0)
      .sort((a, b) => b.recordCount - a.recordCount)
      .slice(0, 10)
      .map((stat) => ({
        name: stat.category.name,
        fullName: stat.category.name,
        records: stat.recordCount,
        categoryId: stat.category.id,
      }));
  }, [descendantCategoryStats]);

  const fileTypeData = useMemo(() => {
    return [
      { name: '이미지', value: totalStats.totalImages, color: '#A855F7' },
      { name: '동영상', value: totalStats.totalVideos, color: '#EF4444' },
      { name: '압축파일', value: totalStats.totalArchives, color: '#EAB308' },
    ].filter((item) => item.value > 0);
  }, [totalStats]);

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

      scopedCategoryStats.forEach((stat) => {
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

      scopedCategoryStats.forEach((stat) => {
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

    scopedCategoryStats.forEach((stat) => {
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
  }, [dateUnit, getCategoryRecords, scopedCategoryStats]);

  const populatedCategoryStats = useMemo(() => {
    return scopedCategoryStats
      .filter((stat) => stat.recordCount > 0)
      .sort((a, b) => (a.category.order ?? 0) - (b.category.order ?? 0));
  }, [scopedCategoryStats]);

  const childCategoryDashboardSections = useMemo<ChildCategoryDashboardSection[]>(() => {
    if (!selectedRootCategory) {
      return [];
    }

    return childCategoryStats.map((childStat) => {
      const categoryIds = new Set<string>();
      const stack = [childStat.category.id];

      while (stack.length > 0) {
        const currentId = stack.pop();
        if (!currentId || categoryIds.has(currentId)) {
          continue;
        }

        categoryIds.add(currentId);
        const children = childrenByParentId.get(currentId) || [];
        children.forEach((child) => stack.push(child.id));
      }

      const subtreeStats = scopedCategoryStats.filter((stat) => categoryIds.has(stat.category.id));
      const recordRanking = subtreeStats
        .flatMap((stat) =>
          (getCategoryRecords(stat.category.id) || []).map((record) => ({
            record,
            category: stat.category,
            referenceCount: getRecordReferenceCount(record.id, stat.category.id),
            displayValue: getRecordDisplayValue(stat.category, record),
          }))
        )
        .filter((item) => item.referenceCount > 0)
        .sort((a, b) => {
          if (b.referenceCount !== a.referenceCount) {
            return b.referenceCount - a.referenceCount;
          }
          return new Date(b.record.updatedAt).getTime() - new Date(a.record.updatedAt).getTime();
        })
        .slice(0, 5);

      const recentRecords = subtreeStats
        .flatMap((stat) => stat.recentRecords.map((record) => ({ record, category: stat.category })))
        .sort((a, b) => new Date(b.record.createdAt).getTime() - new Date(a.record.createdAt).getTime())
        .slice(0, 5);

      return {
        category: childStat.category,
        recordRanking,
        recentRecords,
      };
    });
  }, [childCategoryStats, childrenByParentId, getCategoryRecords, getRecordReferenceCount, scopedCategoryStats, selectedRootCategory]);

  const hasAnyRecords = scopedCategoryStats.some((stat) => stat.recordCount > 0);
  const hasAnyAttachments = fileTypeData.length > 0;
  const hasTrendData = dateTrendData.some((entry) => entry.count > 0);

  const getWarningRecordContext = (item: DashboardWarningItem) => {
    const category = categoryMap.get(item.categoryId) || null;
    const record = category ? getCategoryRecords(item.categoryId).find((candidate) => candidate.id === item.recordId) || null : null;
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

  if (rootCategories.length === 0) {
    return (
      <div className="flex h-full overflow-hidden">
        <Sidebar />
        <div className="flex-1 overflow-y-auto bg-discord-bg discord-scrollbar">
          <div className="p-6">
            <div className="flex items-center justify-between gap-4 mb-6">
              <h1 className="text-2xl font-bold text-discord-text">대시보드</h1>
            </div>
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
            <div className="flex flex-col gap-4 mb-6 md:flex-row md:items-center md:justify-between">
              <h1 className="text-2xl font-bold text-discord-text">대시보드</h1>
              <Select value={selectedRootCategoryId} onValueChange={setSelectedRootCategoryId}>
                <SelectTrigger className="w-full md:w-72 bg-discord-sidebar border-gray-600 text-discord-text">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-discord-sidebar border-gray-600">
                  <SelectItem value={ALL_ROOT_CATEGORIES_VALUE} className="text-discord-text focus:bg-discord-hover">
                    전체 카테고리
                  </SelectItem>
                  {rootCategories.map((category) => (
                    <SelectItem key={category.id} value={category.id} className="text-discord-text focus:bg-discord-hover">
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 ${summaryCards.length >= 5 ? 'lg:grid-cols-5' : summaryCards.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
              {summaryCards.map((card) => (
                <StatCard key={card.key} title={card.title} value={card.value} icon={card.icon} color={card.color} />
              ))}
            </div>

            {selectedWarningTotalCount > 0 && (
              <div className="bg-discord-sidebar rounded-lg p-6 border border-gray-700 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-500/15 text-amber-300">
                      <AlertTriangle size={18} />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-discord-text">주의 항목</h2>
                      <p className="text-sm text-discord-muted">{`확인이 필요한 항목 ${formatNumber(selectedWarningTotalCount)}개`}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 text-xs text-discord-muted">
                    {selectedWarningCounts.missingFiles > 0 && <span>파일 누락 {formatNumber(selectedWarningCounts.missingFiles)}</span>}
                    {selectedWarningCounts.brokenRelations > 0 && <span>참조 깨짐 {formatNumber(selectedWarningCounts.brokenRelations)}</span>}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {filteredWarnings.map((item) => (
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
                {!selectedRootCategory && warningTotalCount > warningItems.length && (
                  <p className="mt-4 text-xs text-discord-muted">
                    상위 {formatNumber(warningItems.length)}개만 표시 중입니다. 전체 경고는 {formatNumber(warningTotalCount)}개입니다.
                  </p>
                )}
              </div>
            )}

            {(hasAnyAttachments || (!selectedRootCategory && categoryRecordData.length > 0) || (selectedRootCategory && childCategoryRecordData.length > 0)) && (
              <div
                className={`grid grid-cols-1 gap-6 mb-6 ${
                  hasAnyAttachments &&
                  ((!selectedRootCategory && categoryRecordData.length > 0) || (selectedRootCategory && childCategoryRecordData.length > 0))
                    ? 'lg:grid-cols-2'
                    : ''
                }`}
              >
                {!selectedRootCategory && categoryRecordData.length > 0 && (
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

                {selectedRootCategory && childCategoryRecordData.length > 0 && (
                  <div className="bg-discord-sidebar rounded-lg p-6 border border-gray-700">
                    <h2 className="text-lg font-semibold text-discord-text mb-4">하위 카테고리별 항목 수</h2>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart
                        data={childCategoryRecordData}
                        onClick={(data: any) => {
                          if (data?.activePayload?.length) {
                            const clickedData = data.activePayload[0].payload;
                            if (clickedData?.categoryId) {
                              selectCategory(clickedData.categoryId);
                              navigate('/category');
                            }
                          }
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="name" stroke="#9CA3AF" fontSize={12} interval={0} />
                        <YAxis stroke="#9CA3AF" fontSize={12} />
                        <Tooltip content={<CustomTooltip />} />
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

            {!selectedRootCategory && hasAnyRecords && hasTrendData && (
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

            {selectedRootCategory && childCategoryDashboardSections.length > 0 && (
              <div className="space-y-6 mb-6">
                {childCategoryDashboardSections.map((section) => (
                  <div key={section.category.id} className="bg-discord-sidebar rounded-lg p-6 border border-gray-700">
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <h2
                        className="text-lg font-semibold text-discord-text cursor-pointer hover:text-discord-accent transition-colors"
                        onClick={() => {
                          selectCategory(section.category.id);
                          navigate('/category');
                        }}
                      >
                        {section.category.name}
                      </h2>
                      <span className="text-sm text-discord-muted">직속 하위 카테고리 대시보드</span>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                      <div className="bg-discord-bg rounded-lg p-6 border border-gray-700">
                        <div className="flex items-center gap-2 mb-4">
                          <TimerReset size={18} className="text-discord-accent" />
                          <h3 className="text-lg font-semibold text-discord-text">참조 랭킹</h3>
                        </div>
                        {section.recordRanking.length > 0 ? (
                          <div className="space-y-3">
                            {section.recordRanking.map((item, index) => (
                              <button
                                key={item.record.id}
                                type="button"
                                className="w-full min-h-[88px] text-left bg-discord-sidebar rounded-lg border border-gray-700 px-4 py-3 hover:border-discord-accent hover:bg-discord-hover transition-colors"
                                onClick={() => {
                                  setSelectedCategory(item.category);
                                  setSelectedRecord(item.record);
                                  setViewRecordModalOpen(true);
                                }}
                              >
                                <div className="flex min-h-[64px] items-center justify-between gap-3">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <RecordThumbnail category={item.category} record={item.record} />
                                    <div className="min-w-0">
                                      <p className="text-sm text-discord-muted mb-1">#{index + 1}</p>
                                      <p className="text-sm font-medium text-discord-text break-all">{item.displayValue}</p>
                                    </div>
                                  </div>
                                  <span className="text-sm text-white">{formatNumber(item.referenceCount)}회</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-discord-muted">참조된 레코드가 아직 없습니다.</p>
                        )}
                      </div>

                      <div className="bg-discord-bg rounded-lg p-6 border border-gray-700">
                        <div className="flex items-center gap-2 mb-4">
                          <Calendar size={18} className="text-discord-accent" />
                          <h3 className="text-lg font-semibold text-discord-text">최근 추가 항목</h3>
                        </div>
                        {section.recentRecords.length > 0 ? (
                          <div className="space-y-3">
                            {section.recentRecords.map(({ record, category }) => (
                              <button
                                key={record.id}
                                type="button"
                                className="w-full min-h-[88px] text-left bg-discord-sidebar rounded-lg border border-gray-700 px-4 py-3 hover:border-discord-accent hover:bg-discord-hover transition-colors"
                                onClick={() => {
                                  setSelectedCategory(category);
                                  setSelectedRecord(record);
                                  setViewRecordModalOpen(true);
                                }}
                              >
                                <div className="flex min-h-[64px] items-center gap-3 min-w-0">
                                  <RecordThumbnail category={category} record={record} />
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-discord-text break-all">{getRecordDisplayValue(category, record)}</p>
                                    <p className="text-xs text-discord-muted mt-1">{new Date(record.createdAt).toLocaleString('ko-KR')}</p>
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-discord-muted">최근 추가된 항목이 없습니다.</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!selectedRootCategory && populatedCategoryStats.length > 0 && (
              <div className="bg-discord-sidebar rounded-lg p-6 border border-gray-700">
                <h2 className="text-lg font-semibold text-discord-text mb-4">카테고리별 상세 통계</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {populatedCategoryStats.map((stat) => {
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
                                const displayValue = getRecordDisplayValue(stat.category, record);
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
