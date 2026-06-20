import { useParams } from 'react-router-dom';
import { PlaceholderCard } from '../components/PlaceholderCard';

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  return (
    <PlaceholderCard
      title="Project"
      hint={`Overview, style, and rooms for project ${projectId ?? '(unknown)'}. F3 will land the project editor here.`}
    />
  );
}