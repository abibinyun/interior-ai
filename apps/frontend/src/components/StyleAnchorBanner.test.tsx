import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StyleAnchorBanner } from './StyleAnchorBanner';

describe('<StyleAnchorBanner />', () => {
  it('renders nothing when the anchor is null', () => {
    const { container } = render(<StyleAnchorBanner anchor={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the anchor is undefined', () => {
    const { container } = render(<StyleAnchorBanner anchor={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for an empty string anchor', () => {
    const { container } = render(<StyleAnchorBanner anchor="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the anchor text inside the banner', () => {
    render(
      <StyleAnchorBanner anchor="House-wide design language: style=JAPANDI | living room: low sofa" />,
    );
    const banner = screen.getByTestId('style-anchor-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent('House-wide design language');
    expect(banner).toHaveTextContent('style=JAPANDI');
    expect(banner).toHaveTextContent('low sofa');
  });

  it('exposes the banner to assistive tech as a note', () => {
    render(<StyleAnchorBanner anchor="anchor text" />);
    expect(screen.getByRole('note', { name: /house-wide design language/i })).toBeInTheDocument();
  });
});
