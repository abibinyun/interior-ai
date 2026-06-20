import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ProjectCard } from './ProjectCard';
import type { Project } from '../api/projects';

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p_1',
    name: 'My Dream House',
    description: 'Three bedrooms, mid-century bones.',
    status: 'IN_PROGRESS',
    createdAt: '2026-06-14T15:00:00.000Z',
    updatedAt: '2026-06-14T15:00:00.000Z',
    completedAt: null,
    ...overrides,
  };
}

describe('<ProjectCard />', () => {
  it('renders the name, description, and status pill', () => {
    render(
      <MemoryRouter>
        <ProjectCard project={makeProject()} />
      </MemoryRouter>,
    );
    expect(screen.getByText('My Dream House')).toBeInTheDocument();
    expect(screen.getByText('Three bedrooms, mid-century bones.')).toBeInTheDocument();
    expect(screen.getByText('In progress')).toBeInTheDocument();
  });

  it('shows "No description" when description is null', () => {
    render(
      <MemoryRouter>
        <ProjectCard project={makeProject({ description: null })} />
      </MemoryRouter>,
    );
    expect(screen.getByText('No description')).toBeInTheDocument();
  });

  it('shows completed date when the project is COMPLETED', () => {
    render(
      <MemoryRouter>
        <ProjectCard
          project={makeProject({
            status: 'COMPLETED',
            completedAt: '2026-06-20T12:00:00.000Z',
          })}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('links to the project detail page', () => {
    render(
      <MemoryRouter>
        <ProjectCard project={makeProject({ id: 'p_42' })} />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/projects/p_42');
  });
});