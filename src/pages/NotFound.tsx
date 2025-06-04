import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const NotFound: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="h-full flex flex-col items-center justify-center p-6">
      <h1 className="text-4xl font-bold text-discord-text mb-4">404</h1>
      <p className="text-discord-muted mb-8">페이지를 찾을 수 없습니다.</p>
      <Button onClick={() => navigate('/')}>
        홈으로 돌아가기
      </Button>
    </div>
  );
};

export default NotFound;
