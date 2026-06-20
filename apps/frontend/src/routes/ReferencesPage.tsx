import { useParams } from 'react-router-dom';
import { PlaceholderCard } from '../components/PlaceholderCard';

export function ReferencesPage() {
  const { roomId } = useParams<{ roomId: string }>();
  return (
    <PlaceholderCard
      title="References"
      hint={`Add GENERATED, EXTERNAL_URL, or UPLOADED references for room ${roomId ?? '(unknown)'}. F8 will land the upload UI here.`}
    />
  );
}