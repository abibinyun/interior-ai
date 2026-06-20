import { useParams } from 'react-router-dom';
import { PlaceholderCard } from '../components/PlaceholderCard';

export function GenerationsPage() {
  const { roomId } = useParams<{ roomId: string }>();
  return (
    <PlaceholderCard
      title="Generations"
      hint={`3-option grid + polling during generation + refinement controls for room ${roomId ?? '(unknown)'}. F4 will wire this to the batch + lineage endpoints.`}
    />
  );
}