import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateBy,
  validateSync,
} from 'class-validator';

/** Limits from spec section 6.5. */
const ID_22 = /^[A-Za-z0-9_-]{22}$/;
const ID_43 = /^[A-Za-z0-9_-]{43}$/;
const COLOR = /^#[0-9a-f]{6}$/;
const MAX_NUMBERS_PER_BATCH = 128;
const BOARD_WIDTH = 1920;
const BOARD_HEIGHT = 1080;

/** An even-length list of integer board points: [x, y, x, y, ...]. */
export function isPointList(value: unknown): value is number[] {
  if (!Array.isArray(value)) return false;
  if (value.length % 2 !== 0 || value.length > MAX_NUMBERS_PER_BATCH)
    return false;
  for (let i = 0; i < value.length; i++) {
    const v: unknown = value[i];
    const max = i % 2 === 0 ? BOARD_WIDTH : BOARD_HEIGHT;
    if (!Number.isInteger(v) || (v as number) < 0 || (v as number) >= max)
      return false;
  }
  return true;
}

function IsPointList(): PropertyDecorator {
  return ValidateBy({
    name: 'isPointList',
    validator: { validate: isPointList },
  });
}

export class HelloDto {
  @IsString() @Matches(ID_22) roomId: string;
  @IsString() @Matches(ID_22) userKey: string;
  @IsOptional() @IsString() @Matches(ID_43) ownerToken?: string;
  @IsString() @Length(1, 24) name: string;
  @IsString() @Matches(COLOR) color: string;
}

export class StrokeStartDto {
  @IsString() @Matches(ID_22) strokeId: string;
  @IsIn(['b', 'e']) tool: 'b' | 'e';
  @IsString() @Matches(COLOR) color: string;
  @IsInt() @Min(1) @Max(64) width: number;
}

export class StrokePointsDto {
  @IsString() @Matches(ID_22) strokeId: string;
  @IsInt() @Min(0) n: number;
  @IsPointList() pts: number[];
}

/** stroke.end, stroke.undo, stroke.redo */
export class StrokeRefDto {
  @IsString() @Matches(ID_22) strokeId: string;
}

/**
 * Turns the data of one message into a validated DTO, or null.
 * Unknown keys, wrong types, and anything that is not a plain object are rejected.
 */
export function parseMessage<T extends object>(
  cls: new () => T,
  data: unknown,
): T | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    return null;
  if (Object.prototype.hasOwnProperty.call(data, '__proto__')) return null;
  const dto = plainToInstance(cls, data);
  const errors = validateSync(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
  });
  return errors.length === 0 ? dto : null;
}
