import { useParams } from 'react-router-dom';
import { PlaceholderCard } from '../components/PlaceholderCard';

export function GenerationDetailPage() {
  const { generationId } = useParams<{ generationId: string }>();
  return (
    <PlaceholderCard
      title="Generation"
      hint={`Lineage tree + refinements for generation ${generationId ?? '(unknown)'}. F5 will land the refinement flow here.`}
    />
  );
}