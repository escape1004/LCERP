# Local ERP

로컬 환경에서 동작하는 비즈니스 관리 시스템입니다. Electron과 React를 기반으로 제작되었으며, SQLite를 사용하여 데이터를 관리합니다.

## 주요 기능

- **카테고리 관리**: 비즈니스 데이터를 카테고리별로 구분하여 관리
- **데이터베이스 관리**: 
  - 데이터베이스 조회 및 관리
  - 자동 백업 시스템
  - 데이터 저장 위치 커스터마이징
- **사용자 친화적 UI**: 
  - Discord 스타일의 모던한 디자인
  - 직관적인 네비게이션
  - 실시간 피드백 시스템

## 기술 스택

- **프레임워크**: 
  - Electron (v36)
  - React (v18)
  - TypeScript
  - Vite

- **UI/UX**:
  - TailwindCSS
  - Radix UI
  - Framer Motion
  - Lucide Icons

- **상태 관리 & 데이터**:
  - Zustand
  - React Query
  - Better SQLite3

## 시작하기

### 개발 환경 설정

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run electron:dev

# 프로덕션 빌드
npm run electron:build
```

### 빌드 옵션

- Windows: NSIS 인스톨러
- macOS: DMG 패키지
- Linux: AppImage

## 주요 기능 설명

### 데이터베이스 관리
- 자동 백업 시스템 내장
- 백업 주기 설정 가능
- 데이터베이스 및 백업 저장 위치 커스터마이징
- 테이블 데이터 실시간 조회

### 카테고리 시스템
- 계층형 카테고리 구조
- 드래그 앤 드롭으로 카테고리 순서 변경
- 카테고리별 데이터 관리

## 시스템 요구사항

- Windows 10 이상
- macOS 10.13 이상
- Linux (최신 버전의 주요 배포판)

## 라이선스

Copyright © 2024 Escape. All rights reserved.
