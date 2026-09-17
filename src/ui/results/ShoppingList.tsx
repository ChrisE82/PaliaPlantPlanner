/**
 * Seed shopping list: crop, seeds, price each, total, where to get them
 * (project task spec, Task A step 5).
 */
import { CROP_BY_ID } from '../../data/crops';
import type { ShoppingList as ShoppingListData } from '../../engine/types';
import CropSwatch from '../CropSwatch';
import { formatInt } from '../format';

function priceText(unitPrice: number | null, currency: 'gold' | 'medals' | null): string {
  if (unitPrice === null) return 'No gold price';
  return `${formatInt(unitPrice)} ${currency === 'medals' ? 'Gardening Medals' : 'gold'}`;
}

function totalText(total: number | null, currency: 'gold' | 'medals' | null): string {
  if (total === null) return '—';
  return `${formatInt(total)} ${currency === 'medals' ? 'Gardening Medals' : 'gold'}`;
}

export interface ShoppingListProps {
  list: ShoppingListData;
}

export default function ShoppingList({ list }: ShoppingListProps) {
  return (
    <div className="shopping-list">
      <div className="table-scroll">
        <table>
          <caption>Seeds to buy</caption>
          <thead>
            <tr>
              <th scope="col">Crop</th>
              <th scope="col">Seeds</th>
              <th scope="col">Price each</th>
              <th scope="col">Total</th>
              <th scope="col">Where to get it</th>
            </tr>
          </thead>
          <tbody>
            {list.lines.map((line) => (
              <tr key={line.cropId}>
                <td>
                  <span className="shopping-list__crop">
                    {CROP_BY_ID.has(line.cropId) && <CropSwatch crop={CROP_BY_ID.get(line.cropId)!} size="small" />}
                    {line.name}
                  </span>
                </td>
                <td>{line.count}</td>
                <td>{priceText(line.unitPrice, line.currency)}</td>
                <td>{totalText(line.total, line.currency)}</td>
                <td>{line.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="shopping-list__total">
        {`Total: ${formatInt(list.totalGold)} gold`}
        {list.totalMedals > 0 ? ` and ${formatInt(list.totalMedals)} Gardening Medals` : ''}
      </p>
    </div>
  );
}
