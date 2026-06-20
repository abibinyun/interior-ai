import { useParams } from 'react-router-dom';
import { PlaceholderCard } from '../components/PlaceholderCard';

export function ExportsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  return (
    <PlaceholderCard
      title="Exports"
      hint={`Versioned ZIP bundles for project ${projectId ?? '(unknown)'}. F9 will land the create + signed download flow here.`}
    />
  );
}