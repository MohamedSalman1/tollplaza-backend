import { BadRequestException } from '@nestjs/common';
import { Op, type WhereOptions } from 'sequelize';

export type SortDirection = 'asc' | 'desc';

/**
 * Keyset cursor: the sort key and direction it was made for, and the last
 * row's sort value (v), crossed_at (t) and id (i).
 */
export type CursorPayload = {
  s: string;
  d: SortDirection;
  v?: string | number | null;
  t: string;
  i: number;
};

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/**
 * Throws 400 for a malformed cursor or one made for another sort.
 */
export function decodeCursor(
  raw: string,
  sort: string,
  dir: SortDirection,
): CursorPayload {
  let payload: CursorPayload;
  try {
    payload = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    ) as CursorPayload;
  } catch {
    throw new BadRequestException('Invalid cursor');
  }

  if (
    typeof payload?.t !== 'string' ||
    Number.isNaN(Date.parse(payload.t)) ||
    !Number.isInteger(payload.i)
  ) {
    throw new BadRequestException('Invalid cursor');
  }
  if (payload.s !== sort || payload.d !== dir) {
    throw new BadRequestException(
      'Cursor was made for a different sort; start again without a cursor',
    );
  }
  return payload;
}

/**
 * Rows strictly after the cursor in ORDER BY [column,] crossed_at, id (all
 * in `dir`). MySQL sorts NULLs first ascending and last descending, and the
 * conditions follow that.
 */
export function keysetWhere(
  column: string | null,
  dir: SortDirection,
  cursor: CursorPayload,
): WhereOptions {
  const after = dir === 'desc' ? Op.lt : Op.gt;
  const afterOrEqual = dir === 'desc' ? Op.lte : Op.gte;
  const t = new Date(cursor.t);

  // crossed_at <= t AND (crossed_at < t OR id < i): the first part keeps it
  // an index range scan
  const tieBreak: WhereOptions = {
    crossed_at: { [afterOrEqual]: t },
    [Op.or]: [{ crossed_at: { [after]: t } }, { id: { [after]: cursor.i } }],
  };

  if (!column) {
    return tieBreak;
  }

  const value = cursor.v ?? null;
  const sameValue: WhereOptions = { [Op.and]: [{ [column]: value }, tieBreak] };

  if (dir === 'desc') {
    return value === null
      ? sameValue
      : {
          [Op.or]: [
            { [column]: { [Op.lt]: value } },
            { [column]: null },
            sameValue,
          ],
        };
  }

  return value === null
    ? { [Op.or]: [{ [column]: { [Op.ne]: null } }, sameValue] }
    : { [Op.or]: [{ [column]: { [Op.gt]: value } }, sameValue] };
}
