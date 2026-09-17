/**
 * Details for the selected placement: crop name and size, each buff from
 * describeBuffs with Yes/No for received, and the goals it counts toward
 * (project task spec, Task A step 5).
 */
import { goalLabel } from '../../engine/goals';
import { BUFF_NAMES, type BuffDetail, type Crop, type CropId, type Goal } from '../../engine/types';

export interface PlantDetailsProps {
  crop: Crop;
  x: number;
  y: number;
  details: readonly BuffDetail[];
  cropsById: ReadonlyMap<CropId, Crop>;
  goalsForCrop: readonly Goal[];
}

export default function PlantDetails({ crop, x, y, details, cropsById, goalsForCrop }: PlantDetailsProps) {
  return (
    <div className="card plant-details">
      <h3>{`${crop.name}, ${crop.size}x${crop.size}, column ${x + 1}, row ${y + 1}`}</h3>
      {details.length > 0 ? (
        <ul className="plant-details__buffs">
          {details.map((d) => {
            const givers = d.givers.map((id) => cropsById.get(id)?.name ?? id);
            return (
              <li key={d.buff}>
                {`${BUFF_NAMES[d.buff]}: ${d.contacts} of ${d.needed} touching tiles`}
                {givers.length > 0 ? ` (${givers.join(', ')})` : ''}
                {` — ${d.received ? 'Yes' : 'No'}`}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">No crop in this garden gives a buff.</p>
      )}

      <h4>Counts toward</h4>
      {goalsForCrop.length > 0 ? (
        <ul className="plant-details__goals">
          {goalsForCrop.map((g) => (
            <li key={g.id}>{goalLabel(g, cropsById)}</li>
          ))}
        </ul>
      ) : (
        <p className="muted">No goal.</p>
      )}
    </div>
  );
}
