import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { queryClient } from './lib/query-client';
import { AppShell } from './routes/AppShell';
import { BundlePreviewPage } from './routes/BundlePreviewPage';
import { ExportsPage } from './routes/ExportsPage';
import { GenerationDetailPage } from './routes/GenerationDetailPage';
import { GenerationsPage } from './routes/GenerationsPage';
import { LandingPage } from './routes/LandingPage';
import { NotFoundPage } from './routes/NotFoundPage';
import { ProjectDetailPage } from './routes/ProjectDetailPage';
import { ProjectsPage } from './routes/ProjectsPage';
import { ReferencesPage } from './routes/ReferencesPage';
import { RoomDetailPage } from './routes/RoomDetailPage';
import { RoomsPage } from './routes/RoomsPage';
import { SettingsPage } from './routes/SettingsPage';
import { StyleCatalogPage } from './routes/StyleCatalogPage';
import { StylePage } from './routes/StylePage';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<LandingPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="projects/:projectId" element={<ProjectDetailPage />} />
            <Route path="projects/:projectId/style" element={<StylePage />} />
            <Route path="projects/:projectId/rooms" element={<RoomsPage />} />
            <Route path="rooms/:roomId" element={<RoomDetailPage />} />
            <Route path="rooms/:roomId/generations" element={<GenerationsPage />} />
            <Route path="generations/:generationId" element={<GenerationDetailPage />} />
            <Route path="rooms/:roomId/references" element={<ReferencesPage />} />
            <Route path="projects/:projectId/exports" element={<ExportsPage />} />
            <Route path="exports/:bundleId" element={<BundlePreviewPage />} />
            <Route path="styles" element={<StyleCatalogPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="legacy/projects/:projectId/rooms" element={<Navigate to="/projects/:projectId/rooms" replace />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}