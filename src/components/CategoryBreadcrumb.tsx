
import React from 'react';
import { ChevronRight } from 'lucide-react';
import { useERPStore } from '../hooks/useERPStore';
import { Category } from '../types';

interface CategoryBreadcrumbProps {
  category: Category;
}

export const CategoryBreadcrumb: React.FC<CategoryBreadcrumbProps> = ({ category }) => {
  const { categories, selectCategory } = useERPStore();

  const getBreadcrumbPath = (cat: Category): Category[] => {
    if (!cat.parentId) return [cat];
    
    const parent = categories.find(c => c.id === cat.parentId);
    if (!parent) return [cat];
    
    return [...getBreadcrumbPath(parent), cat];
  };

  const breadcrumbPath = getBreadcrumbPath(category);

  return (
    <div className="flex items-center gap-2 text-sm">
      {breadcrumbPath.map((cat, index) => (
        <React.Fragment key={cat.id}>
          {index > 0 && (
            <ChevronRight size={16} className="text-gray-500" />
          )}
          {index === breadcrumbPath.length - 1 ? (
            <span className="text-discord-text font-semibold">
              {cat.name}
            </span>
          ) : (
            <button
              onClick={() => selectCategory(cat.id)}
              className="text-discord-accent hover:text-blue-400 hover:underline"
            >
              {cat.name}
            </button>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};
