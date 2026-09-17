/**
 * Compare options: one row per goal plus "Filled tiles", one column per
 * option (project task spec, Task A step 5).
 */
import type { Goal } from '../../engine/types';

const TAB_NAMES = ['Best', 'Option 2', 'Option 3'];

export interface CompareOption {
  label: string;
  /** GoalReport.value keyed by goal id. */
  goalValues: ReadonlyMap<string, string>;
  filledTiles: number;
}

export interface CompareTableProps {
  goals: readonly Goal[];
  goalLabels: ReadonlyMap<string, string>;
  options: readonly CompareOption[];
}

export default function CompareTable({ goals, goalLabels, options }: CompareTableProps) {
  if (options.length <= 1) return null;

  return (
    <div className="table-scroll">
      <table className="compare-table">
        <caption>Compare options</caption>
        <thead>
          <tr>
            <th scope="col">Goal</th>
            {options.map((_o, i) => (
              <th scope="col" key={i}>
                {TAB_NAMES[i] ?? `Option ${i + 1}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {goals.map((g) => (
            <tr key={g.id}>
              <th scope="row">{goalLabels.get(g.id) ?? g.id}</th>
              {options.map((o, i) => (
                <td key={i} className="num">
                  {o.goalValues.get(g.id) ?? ''}
                </td>
              ))}
            </tr>
          ))}
          <tr className="compare-table__totals">
            <th scope="row">Filled tiles</th>
            {options.map((o, i) => (
              <td key={i} className="num">
                {o.filledTiles}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
