import { useParams } from 'react-router-dom';
import { PlaceholderCard } from '../components/PlaceholderCard';

export function StylePage() {
  const { projectId } = useParams<{ projectId: string }>();
  return (
    <PlaceholderCard
      title="Style"
      hint={`Style profile for project ${projectId ?? '(unknown)'}. F3 will surface the catalog + style editor.`}
    />
  );
}