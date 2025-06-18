/// <reference types="vite/client" />

import { ElectronAPI } from './types';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
