import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { useERPStore } from '../hooks/useERPStore';
import { Category, DataRecord } from '../types';
import { BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, TooltipProps } from 'recharts';
import { FileText, Image, Video, Archive, Folder, Calendar } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { ViewRecordModal } from '../components/ViewRecordModal';
import { DatabaseViewer } from '../components/DatabaseViewer';
import { Button } from '../components/ui/button';
import { CategoryModal } from '../components/CategoryModal';

const COLORS = ['#5865F2', '#57F287', '#FEE75C', '#ED4245', '#EB459E', '#95A5A6'];

interface CategoryStats {
  category: Category;
  recordCount: number;
  imageCount: number;
  videoCount: number;
  archiveCount: number;
  recentRecords: DataRecord[];
}

// 숫자 포맷팅 함수
const formatNumber = (num: number): string => {
  return num.toLocaleString('ko-KR');
};

// 커스텀 툴팁 컴포넌트
const CustomTooltip = ({ active, payload, label, labelFormatter }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const value = payload[0].value;
    const displayLabel = labelFormatter ? labelFormatter(label, payload) : (data?.fullName || data?.name || label);
    
    return (
      <div style={{
        backgroundColor: '#2F3136',
        border: '1px solid #40444B',
        borderRadius: '4px',
        padding: '8px 12px',
        color: '#FFFFFF'
      }}>
        {displayLabel && (
          <div style={{ marginBottom: '4px', color: '#FFFFFF', fontWeight: 500 }}>
            {displayLabel}
          </div>
        )}
        <div style={{ color: '#FFFFFF' }}>
          개수: {formatNumber(value)}
        </div>
      </div>
    );
  }
  return null;
};

const StatCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode; color?: string }> = ({ title, value, icon, color = 'bg-discord-accent' }) => (
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
  const { categories, loadCategories, loadRecords, getCategoryRecords, selectCategory, showDbViewer, currentProfile } = useERPStore();
  const [loading, setLoading] = useState(true);
  const [categoryStats, setCategoryStats] = useState<CategoryStats[]>([]);
  const [dateUnit, setDateUnit] = useState<'day' | 'month' | 'year'>('day');
  const [viewRecordModalOpen, setViewRecordModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<DataRecord | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  useEffect(() => {
    const loadAllData = async () => {
      setLoading(true);
      try {
        await loadCategories();
        
        // categories가 로드된 후 다시 가져오기
        const store = useERPStore.getState();
        const loadedCategories = store.categories;
        
        // 상위 카테고리(루트 카테고리)만 필터링 및 정렬 (사이드바와 동일한 순서)
        const rootCategories = loadedCategories
          .filter(cat => !cat.parentId)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        
        // 카테고리가 없으면 예외 처리
        if (rootCategories.length === 0) {
          setCategoryStats([]);
          setLoading(false);
          return;
        }
        
        // 상위 카테고리의 레코드 로드
        const loadPromises = rootCategories.map(cat => loadRecords(cat.id));
        await Promise.all(loadPromises);
        
        // 통계 계산 (상위 카테고리만)
        const stats: CategoryStats[] = rootCategories.map(category => {
          const records = getCategoryRecords(category.id) || [];
          const fileField = category.fields.find(f => f.type === 'file');
          
          let imageCount = 0;
          let videoCount = 0;
          let archiveCount = 0;
          
          records.forEach(record => {
            if (fileField && record.data[fileField.id]) {
              const filePath = record.data[fileField.id];
              const ext = filePath ? filePath.slice(filePath.lastIndexOf('.')).toLowerCase() : '';
              
              if (/\.(jpg|jpeg|png|gif|webp)$/i.test(ext)) {
                imageCount++;
              } else if (/\.(mp4|avi|mkv|mov|wmv|flv|webm)$/i.test(ext)) {
                videoCount++;
              } else if (/\.(zip|7z|rar)$/i.test(ext)) {
                archiveCount++;
              }
            }
          });
          
          // 최근 레코드 5개
          const recentRecords = [...records]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 5);
          
          return {
            category,
            recordCount: records.length,
            imageCount,
            videoCount,
            archiveCount,
            recentRecords
          };
        });
        
        setCategoryStats(stats);
      } catch (error) {
        // 에러 처리
      } finally {
        setLoading(false);
      }
    };
    
    loadAllData();
  }, [loadCategories, loadRecords, getCategoryRecords, currentProfile?.id]);

  // 전체 통계 (상위 카테고리만)
  const totalStats = useMemo(() => {
    const rootCategories = categories.filter(cat => !cat.parentId);
    const totalCategories = rootCategories.length;
    const totalRecords = categoryStats.reduce((sum, stat) => sum + stat.recordCount, 0);
    const totalImages = categoryStats.reduce((sum, stat) => sum + stat.imageCount, 0);
    const totalVideos = categoryStats.reduce((sum, stat) => sum + stat.videoCount, 0);
    const totalArchives = categoryStats.reduce((sum, stat) => sum + stat.archiveCount, 0);
    
    return { totalCategories, totalRecords, totalImages, totalVideos, totalArchives };
  }, [categories, categoryStats]);

  // 카테고리별 항목 수 차트 데이터
  const categoryRecordData = useMemo(() => {
    return categoryStats
      .filter(stat => stat.recordCount > 0)
      .sort((a, b) => b.recordCount - a.recordCount)
      .slice(0, 10)
      .map(stat => ({
        name: stat.category.name,
        fullName: stat.category.name,
        records: stat.recordCount,
        categoryId: stat.category.id
      }));
  }, [categoryStats]);

  // 파일 타입 분포 데이터 (통계 카드와 동일한 색상)
  const fileTypeData = useMemo(() => {
    return [
      { name: '이미지', value: totalStats.totalImages, color: '#A855F7' }, // purple-500
      { name: '동영상', value: totalStats.totalVideos, color: '#EF4444' }, // red-500
      { name: '압축파일', value: totalStats.totalArchives, color: '#EAB308' } // yellow-500
    ].filter(item => item.value > 0);
  }, [totalStats]);

  // 날짜별 항목 추가 추이 (년/월/일 단위)
  const dateTrendData = useMemo(() => {
    const dateMap = new Map<string, number>();
    const today = new Date();
    
    if (dateUnit === 'day') {
      // 최근 30일 초기화
      for (let i = 29; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        dateMap.set(dateStr, 0);
      }
      
      // 모든 항목의 생성일 기준으로 집계
      categoryStats.forEach(stat => {
        const records = getCategoryRecords(stat.category.id) || [];
        records.forEach(record => {
          const dateStr = record.createdAt.split('T')[0];
          if (dateMap.has(dateStr)) {
            dateMap.set(dateStr, (dateMap.get(dateStr) || 0) + 1);
          }
        });
      });
      
      return Array.from(dateMap.entries())
        .map(([date, count]) => ({
          date: new Date(date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
          count
        }));
    } else if (dateUnit === 'month') {
      // 최근 12개월 초기화
      for (let i = 11; i >= 0; i--) {
        const date = new Date(today);
        date.setMonth(date.getMonth() - i);
        const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        dateMap.set(monthStr, 0);
      }
      
      // 모든 항목의 생성일 기준으로 집계
      categoryStats.forEach(stat => {
        const records = getCategoryRecords(stat.category.id) || [];
        records.forEach(record => {
          const recordDate = new Date(record.createdAt);
          const monthStr = `${recordDate.getFullYear()}-${String(recordDate.getMonth() + 1).padStart(2, '0')}`;
          if (dateMap.has(monthStr)) {
            dateMap.set(monthStr, (dateMap.get(monthStr) || 0) + 1);
          }
        });
      });
      
      return Array.from(dateMap.entries())
        .map(([date, count]) => ({
          date: new Date(date + '-01').toLocaleDateString('ko-KR', { year: 'numeric', month: 'short' }),
          count
        }));
    } else { // year
      // 최근 10년 초기화
      for (let i = 9; i >= 0; i--) {
        const date = new Date(today);
        date.setFullYear(date.getFullYear() - i);
        const yearStr = String(date.getFullYear());
        dateMap.set(yearStr, 0);
      }
      
      // 모든 항목의 생성일 기준으로 집계
      categoryStats.forEach(stat => {
        const records = getCategoryRecords(stat.category.id) || [];
        records.forEach(record => {
          const recordDate = new Date(record.createdAt);
          const yearStr = String(recordDate.getFullYear());
          if (dateMap.has(yearStr)) {
            dateMap.set(yearStr, (dateMap.get(yearStr) || 0) + 1);
          }
        });
      });
      
      return Array.from(dateMap.entries())
        .map(([date, count]) => ({
          date: date + '년',
          count
        }));
    }
  }, [categoryStats, getCategoryRecords, dateUnit]);

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

  // 카테고리가 없을 때 예외 처리
  const rootCategories = categories.filter(cat => !cat.parentId);
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
              <p className="text-discord-muted text-sm">새 카테고리를 생성하여 시작하세요.</p>
            </div>
          </div>
        </div>
        <CategoryModal
          isOpen={isCategoryModalOpen}
          onClose={() => setIsCategoryModalOpen(false)}
        />
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
          
          {/* 전체 통계 카드 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <StatCard
              title="전체 카테고리"
              value={totalStats.totalCategories}
              icon={<Folder size={24} className="text-white" />}
              color="bg-blue-500"
            />
            <StatCard
              title="전체 항목"
              value={totalStats.totalRecords}
              icon={<FileText size={24} className="text-white" />}
              color="bg-green-500"
            />
            <StatCard
              title="이미지"
              value={totalStats.totalImages}
              icon={<Image size={24} className="text-white" />}
              color="bg-purple-500"
            />
            <StatCard
              title="동영상"
              value={totalStats.totalVideos}
              icon={<Video size={24} className="text-white" />}
              color="bg-red-500"
            />
            <StatCard
              title="압축파일"
              value={totalStats.totalArchives}
              icon={<Archive size={24} className="text-white" />}
              color="bg-yellow-500"
            />
          </div>

          {/* 차트 섹션 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* 카테고리별 항목 수 */}
            <div className="bg-discord-sidebar rounded-lg p-6 border border-gray-700">
              <h2 className="text-lg font-semibold text-discord-text mb-4">카테고리별 항목 수 (상위 10개)</h2>
              {categoryRecordData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <style>{`
                    .recharts-wrapper:hover {
                      background-color: transparent !important;
                    }
                    .recharts-surface:hover {
                      background-color: transparent !important;
                    }
                    .recharts-tooltip-wrapper {
                      background-color: #2F3136 !important;
                    }
                  `}</style>
                  <BarChart 
                    data={categoryRecordData}
                    onClick={(data: any) => {
                      if (data && data.activePayload && data.activePayload.length > 0) {
                        const clickedData = data.activePayload[0].payload;
                        if (clickedData && clickedData.categoryId) {
                          navigate('/category');
                          selectCategory(clickedData.categoryId);
                        }
                      } else if (data && data.activeLabel) {
                        // activeLabel을 사용하여 데이터 찾기
                        const clickedData = categoryRecordData.find(item => item.name === data.activeLabel);
                        if (clickedData && clickedData.categoryId) {
                          navigate('/category');
                          selectCategory(clickedData.categoryId);
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
                        const maxLength = 8; // 최대 표시 길이
                        const displayText = text.length > maxLength 
                          ? text.substring(0, maxLength) + '...' 
                          : text;
                        
                        return (
                          <g transform={`translate(${x},${y})`}>
                            <text
                              x={0}
                              y={0}
                              dy={16}
                              textAnchor="middle"
                              fill="#9CA3AF"
                              fontSize={12}
                              style={{ textOverflow: 'ellipsis', overflow: 'hidden' }}
                            >
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
                        if (payload && payload.length > 0) {
                          const data = payload[0].payload;
                          return data?.fullName || data?.name || label;
                        }
                        return label;
                      }}
                    />
                    <Bar 
                      dataKey="records" 
                      fill="#5865F2"
                      style={{ cursor: 'pointer' }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-discord-muted">
                  데이터가 없습니다
                </div>
              )}
            </div>

            {/* 파일 타입 분포 */}
            <div className="bg-discord-sidebar rounded-lg p-6 border border-gray-700">
              <h2 className="text-lg font-semibold text-discord-text mb-4">파일 타입 분포</h2>
              {fileTypeData.length > 0 ? (
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
                      labelFormatter={(label: any, payload: any) => {
                        if (payload && payload.length > 0) {
                          return payload[0].name || label || '';
                        }
                        return label || '';
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-discord-muted">
                  데이터가 없습니다
                </div>
              )}
            </div>
          </div>

          {/* 날짜별 항목 추가 추이 */}
          <div className="bg-discord-sidebar rounded-lg p-6 border border-gray-700 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-discord-text">최근 항목 추가 추이</h2>
              <Select value={dateUnit} onValueChange={(value: 'day' | 'month' | 'year') => setDateUnit(value)}>
                <SelectTrigger className="w-32 bg-discord-bg border-gray-600 text-discord-text">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-discord-sidebar border-gray-600">
                  <SelectItem value="day" className="text-discord-text focus:bg-discord-hover">일</SelectItem>
                  <SelectItem value="month" className="text-discord-text focus:bg-discord-hover">월</SelectItem>
                  <SelectItem value="year" className="text-discord-text focus:bg-discord-hover">년</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {dateTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dateTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" stroke="#9CA3AF" fontSize={12} />
                  <YAxis stroke="#9CA3AF" fontSize={12} />
                    <Tooltip
                      content={<CustomTooltip />}
                    />
                    <Line type="monotone" dataKey="count" stroke="#5865F2" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-discord-muted">
                데이터가 없습니다
              </div>
            )}
          </div>

          {/* 카테고리별 상세 통계 */}
          <div className="bg-discord-sidebar rounded-lg p-6 border border-gray-700">
            <h2 className="text-lg font-semibold text-discord-text mb-4">카테고리별 상세 통계</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {categoryStats
                .filter(stat => stat.recordCount > 0)
                .sort((a, b) => (a.category.order ?? 0) - (b.category.order ?? 0))
                .map(stat => {
                  // 카테고리의 첫 번째 텍스트 필드 찾기 (최근 추가된 항목 표시용)
                  const displayField = stat.category.fields.find(f => f.type === 'text') || stat.category.fields[0];
                  
                  return (
                  <div key={stat.category.id} className="bg-discord-bg rounded-lg p-4 border border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <h3 
                        className="text-md font-semibold text-discord-text cursor-pointer hover:text-discord-accent transition-colors"
                        onClick={() => {
                          navigate('/category');
                          selectCategory(stat.category.id);
                        }}
                      >
                        {stat.category.name}
                      </h3>
                      <span className="text-sm text-discord-muted">총 {formatNumber(stat.recordCount)}개 항목</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="flex items-center gap-2">
                        <Image size={16} className="text-purple-400" />
                        <span className="text-sm text-white">이미지: {formatNumber(stat.imageCount)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Video size={16} className="text-red-400" />
                        <span className="text-sm text-white">동영상: {formatNumber(stat.videoCount)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Archive size={16} className="text-yellow-400" />
                        <span className="text-sm text-white">압축파일: {formatNumber(stat.archiveCount)}</span>
                      </div>
                    </div>
                    {stat.recentRecords.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-700">
                        <p className="text-xs text-discord-muted mb-2">최근 추가된 항목:</p>
                        <div className="space-y-1">
                          {stat.recentRecords.map(record => {
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
            {categoryStats.filter(stat => stat.recordCount > 0).length === 0 && (
              <div className="text-center py-8 text-discord-muted">
                항목이 있는 카테고리가 없습니다
              </div>
            )}
          </div>
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
      <CategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
      />
    </div>
  );
}

