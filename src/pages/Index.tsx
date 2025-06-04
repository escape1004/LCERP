
import React from 'react';
import { Sidebar } from '../components/Sidebar';
import { MainContent } from '../components/MainContent';

const Index = () => {
  return (
    <div className="h-screen w-full flex bg-discord-bg font-noto">
      <Sidebar />
      <MainContent />
    </div>
  );
};

export default Index;
