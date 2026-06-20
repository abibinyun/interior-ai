import { useParams } from 'react-router-dom';
import { PlaceholderCard } from '../components/PlaceholderCard';

export function RoomsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  return (
    <PlaceholderCard
      title="Rooms"
      hint={`Rooms in project ${projectId ?? '(unknown)'}. F3 will let the user add rooms and write briefs here.`}
    />
  );
}