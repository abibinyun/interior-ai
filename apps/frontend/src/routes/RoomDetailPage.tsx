import { useParams } from 'react-router-dom';
import { PlaceholderCard } from '../components/PlaceholderCard';

export function RoomDetailPage() {
  const { roomId } = useParams<{ roomId: string }>();
  return (
    <PlaceholderCard
      title="Room"
      hint={`Detail + brief for room ${roomId ?? '(unknown)'}. F4 will land the brief editor and the Generate button here.`}
    />
  );
}