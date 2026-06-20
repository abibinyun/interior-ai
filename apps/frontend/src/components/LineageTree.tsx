import { Link } from 'react-router-dom';
import { ErrorState } from './ErrorState';
import { Skeleton } from './Skeleton';
import { formatDate } from '../lib/format';
import type { LineageNode } from '../api/generations';
import { useLineage } from '../hooks/useLineage';

export interface LineageTreeProps {
  generationId: string;
  currentOptionIndex: number;
}

/**
 * Collapsible lineage tree for a single generation.
 *
 * The lineage has three logical sections:
 *  - **Root**: the very first generation in this room's chain.
 *  - **Ancestors**: the chain from root → current (excluding root).
 *  - **Descendants**: children of this generation (empty for a leaf).
 *
 * We render the full path root → current as a left-to-right chain of
 * pills (each one linked to /generations/:id). Descendants render
 * below as a separate branch.
 */
export function LineageTree({ generationId, currentOptionIndex }: LineageTreeProps) {
  const lineage = useLineage(generationId);

  if (lineage.isPending) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }
  if (lineage.isError) {
    return <ErrorState error={lineage.error} onRetry={() => lineage.refetch()} />;
  }

  // Compose the chain root → current, including the current node last.
  const chain: LineageNode[] = [
    lineage.data.root,
    ...lineage.data.ancestors,
    { id: generationId, optionIndex: currentOptionIndex, createdAt: new Date().toISOString() },
  ];
  const descendants = lineage.data.descendants;

  return (
    <section className="space-y-4" data-testid="lineage-tree">
      <header>
        <h3 className="font-display text-lg font-semibold text-stone-900">Lineage</h3>
        <p className="mt-1 text-xs text-stone-500">
          How this option got here. Click any earlier step to jump back.
        </p>
      </header>

      <Chain chain={chain} currentId={generationId} />

      {descendants.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-xs font-medium uppercase tracking-wider text-stone-500">
            Refined into
          </h4>
          <ul className="space-y-1">
            {descendants.map((d: LineageNode) => (
              <li key={d.id}>
                <Link
                  to={`/generations/${d.id}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-stone-100 bg-white px-3 py-2 text-xs text-stone-700 hover:border-stone-200"
                >
                  <span className="font-mono text-stone-500">Option {d.optionIndex}</span>
                  <span>{formatDate(d.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function Chain({ chain, currentId }: { chain: LineageNode[]; currentId: string }) {
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label="Generation chain">
      {chain.map((node, idx) => (
        <li key={node.id} className="flex items-center gap-2">
          <ChainNode node={node} current={node.id === currentId} />
          {idx < chain.length - 1 ? (
            <span aria-hidden="true" className="text-stone-300">
              →
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function ChainNode({ node, current }: { node: LineageNode; current: boolean }) {
  const base =
    'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium transition';
  const tone = current
    ? 'border border-forest-500 bg-forest-500/10 text-forest-700'
    : 'border border-stone-100 bg-white text-stone-700 hover:border-stone-200';
  return (
    <Link to={`/generations/${node.id}`} className={`${base} ${tone}`}>
      <span className="font-mono">Option {node.optionIndex}</span>
      {current ? <span aria-hidden="true">●</span> : null}
    </Link>
  );
}