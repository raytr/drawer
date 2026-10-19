import {
  HelloDto,
  parseMessage,
  StrokePointsDto,
  StrokeRefDto,
  StrokeStartDto,
} from './messages';

const id = 'A'.repeat(22);

describe('parseMessage', () => {
  it.each([
    [StrokePointsDto, { strokeId: id, n: 0, pts: [0, 0, 1919, 1079] }, true],
    [StrokePointsDto, { strokeId: id, n: 3, pts: [] }, true],
    [StrokePointsDto, { strokeId: id, n: 0, pts: [1, 2, 3] }, false], // odd length
    [StrokePointsDto, { strokeId: id, n: 0, pts: [1920, 0] }, false], // x out of range
    [StrokePointsDto, { strokeId: id, n: 0, pts: [0, 1080] }, false], // y out of range
    [StrokePointsDto, { strokeId: id, n: 0, pts: [1.5, 2] }, false], // not an integer
    [StrokePointsDto, { strokeId: id, n: 0, pts: [-1, 2] }, false],
    [StrokePointsDto, { strokeId: id, n: 0, pts: ['1', 2] }, false],
    [
      StrokePointsDto,
      { strokeId: id, n: 0, pts: new Array(128).fill(1) },
      true,
    ],
    [
      StrokePointsDto,
      { strokeId: id, n: 0, pts: new Array(130).fill(1) },
      false,
    ],
    [StrokePointsDto, { strokeId: id, n: -1, pts: [] }, false],
    [StrokePointsDto, { strokeId: id, n: 0.5, pts: [] }, false],
    [
      StrokeStartDto,
      { strokeId: id, tool: 'b', color: '#e03131', width: 8 },
      true,
    ],
    [
      StrokeStartDto,
      { strokeId: id, tool: 'e', color: '#e03131', width: 64 },
      true,
    ],
    [
      StrokeStartDto,
      { strokeId: id, tool: 'x', color: '#e03131', width: 8 },
      false,
    ],
    [
      StrokeStartDto,
      { strokeId: id, tool: 'b', color: 'red', width: 8 },
      false,
    ],
    [
      StrokeStartDto,
      { strokeId: id, tool: 'b', color: '#E03131', width: 8 },
      false,
    ],
    [
      StrokeStartDto,
      { strokeId: id, tool: 'b', color: '#e03131', width: 65 },
      false,
    ],
    [
      StrokeStartDto,
      { strokeId: id, tool: 'b', color: '#e03131', width: 0 },
      false,
    ],
    [
      StrokeStartDto,
      { strokeId: 1, tool: 'b', color: '#e03131', width: 8 },
      false,
    ],
    [
      StrokeStartDto,
      { strokeId: id, tool: 'b', color: '#e03131', width: 8, extra: 1 },
      false,
    ],
    [
      HelloDto,
      { roomId: id, userKey: id, name: 'Fox', color: '#1971c2' },
      true,
    ],
    [
      HelloDto,
      {
        roomId: id,
        userKey: id,
        ownerToken: 'o'.repeat(43),
        name: 'Fox',
        color: '#1971c2',
      },
      true,
    ],
    [
      HelloDto,
      {
        roomId: id,
        userKey: id,
        ownerToken: 'o'.repeat(42),
        name: 'Fox',
        color: '#1971c2',
      },
      false,
    ],
    [HelloDto, { roomId: id, userKey: id, name: '', color: '#1971c2' }, false],
    [
      HelloDto,
      { roomId: id, userKey: id, name: 'x'.repeat(25), color: '#1971c2' },
      false,
    ],
    [
      HelloDto,
      { roomId: 'short', userKey: id, name: 'Fox', color: '#1971c2' },
      false,
    ],
    [StrokeRefDto, { strokeId: id }, true],
    [StrokeRefDto, 'not an object', false],
    [StrokeRefDto, null, false],
    [StrokeRefDto, [id], false],
  ])('%p %j -> %p', (cls, data, ok) => {
    expect(parseMessage(cls as new () => object, data) !== null).toBe(ok);
  });

  it('returns an instance with the fields', () => {
    const dto = parseMessage(StrokeRefDto, { strokeId: id });
    expect(dto).toBeInstanceOf(StrokeRefDto);
    expect(dto!.strokeId).toBe(id);
  });

  it('rejects a __proto__ key and does not pollute prototypes', () => {
    const data: unknown = JSON.parse(
      `{"strokeId":"${id}","__proto__":{"polluted":1}}`,
    );
    expect(parseMessage(StrokeRefDto, data)).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(
      (new StrokeRefDto() as unknown as Record<string, unknown>).polluted,
    ).toBeUndefined();
  });
});

describe('parseMessage with hostile nesting', () => {
  function nested(depth: number): unknown {
    let v: unknown = 'x';
    for (let i = 0; i < depth; i++) v = { a: v };
    return v;
  }

  it('rejects a deeply nested field without throwing', () => {
    const data = {
      roomId: id,
      userKey: id,
      name: nested(9000),
      color: '#1971c2',
    };
    expect(() => parseMessage(HelloDto, data)).not.toThrow();
    expect(parseMessage(HelloDto, data)).toBeNull();
  });

  it('rejects nested objects and nested arrays in any field', () => {
    expect(parseMessage(StrokeRefDto, { strokeId: { a: 1 } })).toBeNull();
    expect(
      parseMessage(StrokePointsDto, { strokeId: id, n: 0, pts: [[1, 2]] }),
    ).toBeNull();
  });
});
